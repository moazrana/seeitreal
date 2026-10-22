import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { glbToGltf } from 'gltf-pipeline';

// Matches the conventional install path from the ops setup (see
// /opt/usdz-tools on the server) — overridable via env for anywhere that
// installs the toolchain elsewhere.
const DEFAULT_PYTHON_BIN = '/opt/usdz-tools/venv/bin/python3';
const DEFAULT_CONVERTER_SCRIPT = '/opt/usdz-tools/gltf_to_usdz.py';

// The real model we tested this against (747k verts / 1.4M tris) converted
// in ~1s; this is a generous ceiling for pathological cases, not a tuned
// expected duration.
const CONVERT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * GLB → USDZ conversion (spec §11.3) — mandatory for iOS AR Quick Look;
 * `<model-viewer>` needs both formats. Tripo only returns a GLB.
 *
 * Two-stage pipeline:
 *  1. gltf-pipeline (Node, `glbToGltf`) unpacks the binary GLB into a
 *     self-contained glTF JSON with buffers/images embedded — this avoids
 *     writing our own GLB binary-chunk parser.
 *  2. `gltf_to_usdz.py` (a from-scratch script using Pixar's real `pxr` USD
 *     bindings via the `usd-core` pip package — see /opt/usdz-tools on the
 *     server) turns that into a `.usdz`.
 *
 * Deliberately NOT using kcoley/gltf2usd for step 2: that project is
 * Python 2-only (implicit relative imports throughout, `from sets import
 * Set` in Skin.py — a module Python 3 removed outright) with no active
 * maintenance. Dish models are static (no skeleton/animation), so a
 * focused in-house script covering triangle meshes + one PBR
 * metallic-roughness material per primitive is both simpler and avoids
 * inheriting that codebase's unknown remaining Py2/3 bugs.
 */
@Injectable()
export class UsdzConversionService {
  private readonly logger = new Logger(UsdzConversionService.name);
  private readonly pythonBin: string;
  private readonly converterScript: string;

  constructor(private readonly config: ConfigService) {
    this.pythonBin =
      this.config.get<string>('USDZ_PYTHON_BIN') || DEFAULT_PYTHON_BIN;
    this.converterScript =
      this.config.get<string>('USDZ_CONVERTER_SCRIPT') ||
      DEFAULT_CONVERTER_SCRIPT;
  }

  /** Best-effort check that the conversion toolchain is actually installed
   * on this host — doesn't guarantee a given conversion will succeed. */
  isAvailable(): boolean {
    return existsSync(this.pythonBin) && existsSync(this.converterScript);
  }

  async convert(glbBuffer: Buffer): Promise<Buffer> {
    const workDir = await mkdtemp(join(tmpdir(), 'usdz-convert-'));
    try {
      const gltfPath = join(workDir, 'model.gltf');
      const usdzPath = join(workDir, 'model.usdz');

      // Embed everything (buffers + images as data URIs / bufferViews) so
      // the Python side never has to resolve external file references.
      const { gltf } = await glbToGltf(glbBuffer);
      await writeFile(gltfPath, JSON.stringify(gltf));

      await this.runConverter(gltfPath, usdzPath);

      return await readFile(usdzPath);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private runConverter(gltfPath: string, usdzPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Fixed argv array, no shell — gltfPath/usdzPath are our own temp
      // paths, never user input, but this avoids any injection surface
      // regardless.
      const child = spawn(
        this.pythonBin,
        [this.converterScript, '--gltf', gltfPath, '--output', usdzPath],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );

      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('USDZ conversion timed out'));
      }, CONVERT_TIMEOUT_MS);

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve();
          return;
        }
        this.logger.error(
          `gltf_to_usdz.py exited with code ${code}: ${stderr.slice(-2000)}`,
        );
        reject(new Error(`USDZ conversion failed (exit code ${code})`));
      });
    });
  }
}
