#!/usr/bin/env python3
"""
Converts a glTF JSON (produced from a Tripo GLB via Node's gltf-pipeline
glbToGltf — buffers embedded as a base64 data-URI, images embedded as
bufferViews) into a .usdz package.

Written in-house rather than reusing kcoley/gltf2usd: that project is
Python 2-only (implicit relative imports throughout every module, plus
`from sets import Set` in Skin.py — a module Python 3 removed outright,
and at least one more reported Py2/3 numeric bug in later Python 3 runs)
with no active maintenance to fall back on.

Dish models from Tripo are static — no skeleton/animation — so this only
needs to handle: a scene graph of transform nodes, each optionally holding
triangle-mesh geometry (POSITION/NORMAL/TEXCOORD_0) and a single glTF PBR
metallic-roughness material (baseColor / metallic-roughness / normal
textures or scalar factors). Anything outside that (skinning, morph
targets, non-triangle primitives) raises rather than silently producing a
wrong model.

Usage: gltf_to_usdz.py --gltf model.gltf --output model.usdz
"""
import argparse
import base64
import json
import os
import sys
import tempfile
import traceback

import numpy as np
from pxr import Ar, Gf, Sdf, Usd, UsdGeom, UsdShade, UsdUtils, Vt

COMPONENT_DTYPES = {
    5120: np.int8,
    5121: np.uint8,
    5122: np.int16,
    5123: np.uint16,
    5125: np.uint32,
    5126: np.float32,
}
TYPE_NUM_COMPONENTS = {
    'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4,
    'MAT2': 4, 'MAT3': 9, 'MAT4': 16,
}
MIME_EXT = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
}


def load_buffers(gltf):
    buffers = []
    for b in gltf.get('buffers', []):
        uri = b.get('uri')
        if uri is None or not uri.startswith('data:'):
            raise ValueError(
                'only embedded data-URI buffers are supported (expected '
                'output from gltf-pipeline glbToGltf); got: %r' % (uri and uri[:60])
            )
        _, b64 = uri.split(',', 1)
        buffers.append(base64.b64decode(b64))
    return buffers


def read_bufferview_bytes(gltf, buffers, bv_index):
    bv = gltf['bufferViews'][bv_index]
    buf = buffers[bv['buffer']]
    offset = bv.get('byteOffset', 0)
    length = bv['byteLength']
    return buf[offset:offset + length]


def read_accessor(gltf, buffers, accessor_index):
    accessor = gltf['accessors'][accessor_index]
    count = accessor['count']
    nc = TYPE_NUM_COMPONENTS[accessor['type']]
    dtype = COMPONENT_DTYPES[accessor['componentType']]
    bv_index = accessor.get('bufferView')
    if bv_index is None:
        return np.zeros((count, nc), dtype=np.float32)
    bv = gltf['bufferViews'][bv_index]
    buf = buffers[bv['buffer']]
    comp_size = np.dtype(dtype).itemsize
    elem_size = comp_size * nc
    byte_offset = bv.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    stride = bv.get('byteStride') or elem_size
    if stride == elem_size:
        arr = np.frombuffer(buf, dtype=dtype, count=count * nc, offset=byte_offset).reshape(count, nc)
    else:
        arr = np.empty((count, nc), dtype=dtype)
        for i in range(count):
            off = byte_offset + i * stride
            arr[i] = np.frombuffer(buf, dtype=dtype, count=nc, offset=off)
    return arr


def extract_images(gltf, buffers, out_dir):
    """Writes each glTF image to out_dir, returns list of relative filenames indexed like gltf['images']."""
    paths = []
    for i, img in enumerate(gltf.get('images', [])):
        mime = img.get('mimeType', 'image/png')
        ext = MIME_EXT.get(mime, 'bin')
        if 'bufferView' in img:
            data = read_bufferview_bytes(gltf, buffers, img['bufferView'])
        elif 'uri' in img and img['uri'].startswith('data:'):
            _, b64 = img['uri'].split(',', 1)
            data = base64.b64decode(b64)
        else:
            raise ValueError('image %d has neither bufferView nor embedded data-URI' % i)
        name = 'texture_%d.%s' % (i, ext)
        with open(os.path.join(out_dir, name), 'wb') as f:
            f.write(data)
        paths.append(name)
    return paths


def node_transform_matrix(node):
    if 'matrix' in node:
        m = node['matrix']
        # glTF matrices are column-major flat arrays; Gf.Matrix4d(*16 floats)
        # fills row-major, which is exactly the transpose of what we want —
        # so transposing once more here yields the correct matrix.
        return Gf.Matrix4d(*m).GetTranspose()
    t = node.get('translation', [0, 0, 0])
    r = node.get('rotation', [0, 0, 0, 1])  # glTF order: x, y, z, w
    s = node.get('scale', [1, 1, 1])
    mt = Gf.Matrix4d(1.0).SetTranslate(Gf.Vec3d(*t))
    mr = Gf.Matrix4d(1.0).SetRotate(Gf.Quatd(r[3], Gf.Vec3d(r[0], r[1], r[2])))
    ms = Gf.Matrix4d(1.0).SetScale(Gf.Vec3d(*s))
    return ms * mr * mt


def build_material(stage, mat_path, gltf_material, texture_files):
    material = UsdShade.Material.Define(stage, mat_path)
    shader = UsdShade.Shader.Define(stage, mat_path.AppendChild('PreviewSurface'))
    shader.CreateIdAttr('UsdPreviewSurface')
    material.CreateSurfaceOutput().ConnectToSource(shader.ConnectableAPI(), 'surface')

    st_reader = UsdShade.Shader.Define(stage, mat_path.AppendChild('stReader'))
    st_reader.CreateIdAttr('UsdPrimvarReader_float2')
    st_reader.CreateInput('varname', Sdf.ValueTypeNames.Token).Set('st')
    st_reader.CreateOutput('result', Sdf.ValueTypeNames.Float2)

    pbr = gltf_material.get('pbrMetallicRoughness', {})

    def make_texture_node(name, tex_ref, colorspace=None, scale=None, bias=None):
        image_file = texture_files[tex_ref['index']]
        tex = UsdShade.Shader.Define(stage, mat_path.AppendChild(name))
        tex.CreateIdAttr('UsdUVTexture')
        tex.CreateInput('file', Sdf.ValueTypeNames.Asset).Set('./' + image_file)
        tex.CreateInput('st', Sdf.ValueTypeNames.Float2).ConnectToSource(st_reader.ConnectableAPI(), 'result')
        tex.CreateInput('wrapS', Sdf.ValueTypeNames.Token).Set('repeat')
        tex.CreateInput('wrapT', Sdf.ValueTypeNames.Token).Set('repeat')
        if scale is not None:
            tex.CreateInput('scale', Sdf.ValueTypeNames.Float4).Set(Gf.Vec4f(*scale))
        if bias is not None:
            tex.CreateInput('bias', Sdf.ValueTypeNames.Float4).Set(Gf.Vec4f(*bias))
        if colorspace:
            tex.CreateInput('sourceColorSpace', Sdf.ValueTypeNames.Token).Set(colorspace)
        return tex

    base_color_tex = pbr.get('baseColorTexture')
    if base_color_tex:
        tex = make_texture_node('BaseColorTex', base_color_tex, colorspace='sRGB')
        tex.CreateOutput('rgb', Sdf.ValueTypeNames.Float3)
        shader.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).ConnectToSource(tex.ConnectableAPI(), 'rgb')
    else:
        bcf = pbr.get('baseColorFactor', [1, 1, 1, 1])
        shader.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(*bcf[:3]))

    mr_tex = pbr.get('metallicRoughnessTexture')
    if mr_tex:
        # glTF packs roughness in G and metallic in B of the same texture.
        tex = make_texture_node('MetallicRoughnessTex', mr_tex, colorspace='raw')
        tex.CreateOutput('g', Sdf.ValueTypeNames.Float)
        tex.CreateOutput('b', Sdf.ValueTypeNames.Float)
        shader.CreateInput('roughness', Sdf.ValueTypeNames.Float).ConnectToSource(tex.ConnectableAPI(), 'g')
        shader.CreateInput('metallic', Sdf.ValueTypeNames.Float).ConnectToSource(tex.ConnectableAPI(), 'b')
    else:
        shader.CreateInput('roughness', Sdf.ValueTypeNames.Float).Set(float(pbr.get('roughnessFactor', 1.0)))
        shader.CreateInput('metallic', Sdf.ValueTypeNames.Float).Set(float(pbr.get('metallicFactor', 1.0)))

    normal_tex = gltf_material.get('normalTexture')
    if normal_tex:
        # Standard UsdPreviewSurface remap for tangent-space normal maps
        # stored as unsigned [0,1] color: scale*2-1 puts them back in [-1,1].
        tex = make_texture_node(
            'NormalTex', normal_tex, colorspace='raw',
            scale=(2, 2, 2, 2), bias=(-1, -1, -1, -1),
        )
        tex.CreateOutput('rgb', Sdf.ValueTypeNames.Float3)
        shader.CreateInput('normal', Sdf.ValueTypeNames.Normal3f).ConnectToSource(tex.ConnectableAPI(), 'rgb')

    if gltf_material.get('alphaMode') == 'BLEND':
        alpha = pbr.get('baseColorFactor', [1, 1, 1, 1])[3]
        shader.CreateInput('opacity', Sdf.ValueTypeNames.Float).Set(float(alpha))

    return material


def add_mesh_prim(stage, path, gltf, buffers, primitive, materials_by_index):
    mode = primitive.get('mode', 4)
    if mode != 4:
        raise ValueError('only TRIANGLES primitives (mode=4) are supported, got mode=%s' % mode)

    attrs = primitive['attributes']
    positions = read_accessor(gltf, buffers, attrs['POSITION']).astype(np.float32)
    indices = read_accessor(gltf, buffers, primitive['indices']).astype(np.int32).reshape(-1)

    mesh = UsdGeom.Mesh.Define(stage, path)
    mesh.CreatePointsAttr(Vt.Vec3fArray.FromNumpy(positions))
    tri_count = len(indices) // 3
    mesh.CreateFaceVertexCountsAttr(Vt.IntArray.FromNumpy(np.full(tri_count, 3, dtype=np.int32)))
    mesh.CreateFaceVertexIndicesAttr(Vt.IntArray.FromNumpy(indices))

    if 'NORMAL' in attrs:
        normals = read_accessor(gltf, buffers, attrs['NORMAL']).astype(np.float32)
        mesh.CreateNormalsAttr(Vt.Vec3fArray.FromNumpy(normals))
        mesh.SetNormalsInterpolation(UsdGeom.Tokens.vertex)

    if 'TEXCOORD_0' in attrs:
        uv = read_accessor(gltf, buffers, attrs['TEXCOORD_0']).astype(np.float32)
        # glTF UV origin is top-left; USD/UsdPreviewSurface expects bottom-left.
        uv[:, 1] = 1.0 - uv[:, 1]
        primvars_api = UsdGeom.PrimvarsAPI(mesh.GetPrim())
        st_primvar = primvars_api.CreatePrimvar('st', Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.vertex)
        st_primvar.Set(Vt.Vec2fArray.FromNumpy(uv))

    mat_index = primitive.get('material')
    if mat_index is not None and mat_index in materials_by_index:
        UsdShade.MaterialBindingAPI.Apply(mesh.GetPrim()).Bind(materials_by_index[mat_index])
    gltf_material = gltf['materials'][mat_index] if mat_index is not None else {}
    mesh.CreateDoubleSidedAttr(bool(gltf_material.get('doubleSided', False)))
    mesh.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)


def convert(gltf_path, output_path):
    with open(gltf_path) as f:
        gltf = json.load(f)

    buffers = load_buffers(gltf)
    work_dir = tempfile.mkdtemp(prefix='gltf2usdz-')
    texture_files = extract_images(gltf, buffers, work_dir)

    usdc_path = os.path.join(work_dir, 'model.usdc')
    stage = Usd.Stage.CreateNew(usdc_path)
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y)
    UsdGeom.SetStageMetersPerUnit(stage, 1.0)

    root_path = Sdf.Path('/Model')
    UsdGeom.Xform.Define(stage, root_path)
    stage.SetDefaultPrim(stage.GetPrimAtPath(root_path))

    materials_by_index = {}
    for i, m in enumerate(gltf.get('materials', [])):
        mat_path = root_path.AppendChild('Materials').AppendChild('mat_%d' % i)
        materials_by_index[i] = build_material(stage, mat_path, m, texture_files)

    node_counter = [0]

    def walk(node_index, parent_path):
        node = gltf['nodes'][node_index]
        node_counter[0] += 1
        xform_path = parent_path.AppendChild('node_%d' % node_counter[0])
        xform = UsdGeom.Xform.Define(stage, xform_path)
        matrix = node_transform_matrix(node)
        if matrix != Gf.Matrix4d(1.0):
            xform.AddTransformOp().Set(matrix)

        if 'mesh' in node:
            mesh_def = gltf['meshes'][node['mesh']]
            for pi, prim in enumerate(mesh_def['primitives']):
                add_mesh_prim(stage, xform_path.AppendChild('mesh_%d' % pi), gltf, buffers, prim, materials_by_index)

        for child in node.get('children', []):
            walk(child, xform_path)

    scene_index = gltf.get('scene', 0)
    for root_node in gltf['scenes'][scene_index]['nodes']:
        walk(root_node, root_path)

    stage.GetRootLayer().Save()

    out_dir = os.path.dirname(os.path.abspath(output_path)) or '.'
    out_name = os.path.basename(output_path)
    os.makedirs(out_dir, exist_ok=True)

    cwd = os.getcwd()
    try:
        os.chdir(work_dir)
        resolver = Ar.GetResolver()
        resolved = resolver.Resolve('model.usdc')
        context = resolver.CreateDefaultContextForAsset(resolved)
        with Ar.ResolverContextBinder(context):
            ok = UsdUtils.CreateNewUsdzPackage(resolved, 'model.usdz')
        if not ok:
            raise RuntimeError('UsdUtils.CreateNewUsdzPackage returned False')
        os.replace(os.path.join(work_dir, 'model.usdz'), os.path.join(out_dir, out_name))
    finally:
        os.chdir(cwd)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--gltf', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    try:
        convert(args.gltf, args.output)
    except Exception:
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
