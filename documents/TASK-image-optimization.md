# Task: Image Optimization Before Tripo

**For:** Claude Code to implement.
**Relation to other specs:** Extends the main spec's 3D pipeline (§11) and the upload-security rules (§7.5). Also improves perceived generation speed (works alongside the async/queue improvements).

---

## Objective

Restaurant owners shoot dishes on modern phones — 4–12 MB photos, up to 5 per dish. Sending these raw is slow to upload (especially on Pakistani mobile networks), slow for the server to handle, and can exceed Tripo's input limits. Oversized images do **not** improve the 3D model. So: **compress and resize every photo before it reaches Tripo**, on both the client and the server.

Pipeline:
```
owner uploads → (client pre-compress) → validate (§7.5) → server resize/normalize → store a clean copy on R2 → send compressed images to Tripo
```

---

## Requirements

### 1. Client-side pre-compression (before upload)
- In the browser, before uploading, resize each photo's longest edge to ~**2048 px** and re-encode (e.g. `browser-image-compression` or a canvas step). This kills the slow-upload problem at the source so fat files never travel.
- The server still re-processes (never trust the client to have done it correctly).

### 2. Server-side resize + normalize (authoritative)
Use **sharp** in the NestJS pipeline. For each uploaded image:
- **Auto-rotate** using the EXIF orientation flag first (a sideways photo confuses reconstruction), then **strip EXIF/metadata**.
- **Resize** longest edge to **1500–2048 px**, `fit: inside`, never enlarge.
- **Re-encode** as JPEG ~**80–85%** quality (or WebP). This takes a 10 MB photo to a few hundred KB with no meaningful reconstruction loss.
- Enforce a **max input size and dimension**; reject anything over the limit (ties to §7.5).

```ts
import sharp from 'sharp';
const clean = await sharp(inputBuffer)
  .rotate()                                   // apply EXIF orientation, then metadata is dropped
  .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality: 82 })
  .toBuffer();
// send `clean` to Tripo
```

### 3. What to store
- Store a **clean ~2048 px copy on R2** as the source of truth (for re-generation / a higher-quality pass later). Keeping the full raw original is optional.
- Send the compressed image(s) to Tripo (single-image, or the multiview set of up to 5).

### 4. Guardrails (don't over-compress)
- Do **not** shrink below ~**1024 px** or crush quality too far — reconstruction still needs to see edges and texture clearly. ~1500–2048 px at ≥80% quality is the sweet spot: small and fast, still sharp.
- Keep it **image-only** and run the full §7.5 checks (extension + MIME + magic bytes, rename, non-executable storage) on every one of the up-to-5 files.

---

## Acceptance Criteria

- Photos are compressed client-side before upload and resized/normalized server-side before reaching Tripo.
- EXIF orientation is applied then metadata stripped; images are re-encoded to ~2048 px / ~80–85% quality.
- A clean copy is stored on R2; compressed images (not raw) are sent to Tripo.
- Oversized/invalid uploads are rejected; all §7.5 security checks still run on each file.
- Model quality is unchanged vs raw input; upload and hand-off are visibly faster.
