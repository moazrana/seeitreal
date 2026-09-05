// Security policy for the manual-GLB "hero dish" bypass
// (documents/3d-model-enhancement.md §5) — a restaurant owner uploads a
// finished .glb (from Polycam/photogrammetry/a 3D artist) instead of
// generating one via Tripo. Kept as code constants (not env vars), same
// reasoning as image-upload.constants.ts: this is a security policy, not
// per-environment config.

// GLBs bundle geometry + baked textures, so they run larger than a photo
// upload — 100MB comfortably covers a hero dish while still bounding the
// work the USDZ converter has to do on it.
export const MAX_GLB_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB

export const ALLOWED_GLB_EXTENSIONS = ['.glb'] as const;
// Browsers/OSes have no standard MIME type for .glb — 'model/gltf-binary'
// is the registered one, but a raw file input commonly reports the
// filesystem-default 'application/octet-stream' instead. Both are allowed
// at this (client-claim) stage; the magic-byte check below is what's
// actually authoritative, same division of labor as image uploads.
export const ALLOWED_GLB_MIME_TYPES = [
  'model/gltf-binary',
  'application/octet-stream',
] as const;

// glTF Binary (.glb) container header, per the Khronos glTF 2.0 spec:
// a 12-byte header of [magic: uint32][version: uint32][length: uint32],
// all little-endian. This is the GLB equivalent of sharp's decode-based
// magic-byte verification for images — there's no image-style "decoder" to
// lean on for a 3D asset, so the header is checked directly.
export const GLB_HEADER_BYTE_LENGTH = 12;
export const GLB_MAGIC = 0x46546c67; // ASCII "glTF", read little-endian
export const GLB_SUPPORTED_VERSION = 2;
