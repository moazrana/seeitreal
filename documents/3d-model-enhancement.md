# 3D Model Enhancement — Realism Improvements

**For:** Claude Code to implement.
**Relation to main spec:** Extends **§11 (3D Model Pipeline)** of the main SeeItReal spec. Works together with the **Real-World AR Sizing** task (scaling runs after generation; both must be compatible).

---

## Objective

Generated dish models currently look unrealistic (plasticky / blobby / fake-lit). Fix this across the whole pipeline so models look convincingly real in AR. The improvements fall into three buckets: **better input** (multi-photo capture), **better generation** (max Tripo settings + multiview), and **better rendering** (viewer lighting).

---

## Scope

1. Let the restaurant owner upload **up to 5 photos** per dish and route them through Tripo's **multiview** generation.
2. Use **maximum-quality generation settings** (PBR, textures, latest model version).
3. Ship a proper **`<model-viewer>` lighting + shadow configuration** as the default.
4. Show restaurant owners a **photo-capture guide** so their input photos are good.
5. (Optional) Document a **hero-dish fallback** for when AI still isn't good enough.

---

## Requirements

### 1. Multi-photo upload (up to 5) → multiview generation
- Allow **1 to 5 photos** per dish in the item form (front, side, top, back, angle).
- **Routing logic:**
  - **1 photo** → use Tripo's single image-to-3D endpoint.
  - **2–5 photos** → use Tripo's **multiview** generation (multiple angles of the same dish). This is the single biggest realism gain, because the model is reconstructed from real views instead of the AI hallucinating the unseen sides.
  - If Tripo's multiview accepts fewer images than uploaded, select the most **distinct angles** and send those.
- The first photo doubles as the item's display photo / thumbnail.
- **Security:** every one of the up-to-5 uploads must pass the full §7.5 upload checks individually — image-only (jpeg/png/webp), verified by extension + MIME + magic bytes, size/dimension limits, renamed to a server-generated name, stored in non-executable storage. No exceptions because there are multiple files.

### 2. Maximum-quality generation settings
In the Tripo generation call, set:
- **`texture: true`** and **`pbr: true`** — PBR (physically-based materials) is what makes the model respond correctly to light instead of looking like painted plastic.
- **Highest texture-quality** option available.
- **Latest Tripo model version.**
Make these configurable via env/config, not hardcoded, so they can be tuned later.

### 3. `<model-viewer>` lighting + shadow config (default for all AR pages)
A good model looks fake with bad viewer lighting; good lighting makes average models look convincing. Ship these attributes as the default on the diner AR viewer:
```html
<model-viewer
  src="dish.glb"
  ios-src="dish.usdz"
  ar
  camera-controls
  environment-image="neutral"
  exposure="1.0"
  tone-mapping="neutral"
  shadow-intensity="1"
  shadow-softness="1">
</model-viewer>
```
- **`environment-image`** (image-based lighting) is the big one — realistic reflections and soft light. For food, prefer a **warm kitchen/restaurant HDR** environment over the flat default. Host the HDR yourself (e.g. on R2) and reference it, or use `"neutral"` as a baseline.
- The **contact shadow** (`shadow-intensity` / `shadow-softness`) grounds the object so it sits on the surface instead of floating.

### 4. Photo-capture guide for restaurant owners
Add an in-dashboard guide (shown at/near the photo-upload step) telling owners how to shoot good input photos, because input quality is the #1 driver of output quality:
- Bright, **even, diffuse lighting** — no harsh shadows or glare (glossy reflections wreck reconstruction).
- **Plain, uncluttered background.**
- **High resolution**, dish filling the frame.
- **Multiple angles** (front, side, top — up to 5) for best results.
Keep it short and visual (a few example do/don't images).

### 5. (Optional) Hero-dish fallback — documentation only
For best-selling / signature dishes where AI still isn't good enough (food is the hardest case), document a higher-effort path the operator can use:
- **Polycam** (phone LiDAR + photogrammetry) — exports GLB/USDZ at real-world scale, more realistic than single-photo AI.
- **Photogrammetry** (RealityScan / Meshroom) — many photos → true reconstruction.
- **A 3D artist** to clean up or build hero items.
This is an operational option, not code — but the pipeline should accept a manually-uploaded GLB (bypassing Tripo) so these models can enter the same QA → live flow.

---

## Acceptance Criteria (Definition of Done)

- The item form accepts **1–5 photos**; all pass the §7.5 security checks individually.
- Uploading **2+ photos** triggers Tripo **multiview** generation; a single photo uses single-image generation.
- Generation runs with **PBR + textures on** at the highest texture quality and latest model version (values from config, not hardcoded).
- The diner AR viewer ships with the **environment-image + exposure + tone-mapping + contact-shadow** configuration; models are visibly grounded and lit, not flat/floating.
- A **photo-capture guide** is visible to owners at the upload step.
- The pipeline can also accept a **manually-uploaded GLB** for hero dishes, entering the normal QA → live flow.
- Multiview output remains compatible with the real-world scaling step (scaling still runs after generation, before USDZ conversion).
- All existing security, validation, and coding-standard rules from the main spec still hold.

---

## Notes

- Input quality dominates everything else — multiview + good source photos is worth more than any post-processing.
- Keep the Tripo settings and the HDR environment configurable so realism can be tuned without code changes.
