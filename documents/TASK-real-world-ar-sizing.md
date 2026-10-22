# Task: Real-World AR Sizing

**Type:** Feature / pipeline change
**Related spec:** Extends §11 (3D Model Pipeline) and §5 (Data Model) of the main development spec.
**For:** Claude Code to implement.

---

## Objective

Make every dish/product appear at its **true real-world size** in AR. Right now the AI 3D generator (Tripo) returns models at an **arbitrary, normalized scale** — a burger and a wardrobe can come out the same size in the file. glTF/GLB measures in **meters**, and AR viewers (Scene Viewer / Quick Look) place the model at whatever size the file declares. If we don't set the real size, dishes appear tiny or giant on the table, which breaks the core "see the real portion" promise.

The fix has two parts: **store each item's real dimensions**, and **scale the generated model to match** before it goes live.

---

## Scope

1. Add real-world dimension fields to the menu item.
2. Let the restaurant owner enter those dimensions in the dashboard.
3. Add a **scaling step** to the 3D pipeline that resizes the generated GLB to the real dimensions — running **after** the Tripo GLB is downloaded and **before** the GLB→USDZ conversion, so both files end up correctly sized.
4. (Optional, recommended) Show live dimension annotations in the AR viewer.

---

## Requirements

### 1. Data model
Add to the `MenuItem` entity/table (all nullable — an item may be measured after creation):
- `width_mm` (integer, millimetres)
- `height_mm` (integer, millimetres)
- `length_mm` (integer, millimetres)

Create a migration for these columns. Do not edit the schema by hand.

### 2. Dashboard input
- Add width / height / length fields (in mm or cm — pick one unit, label it clearly, store as mm) to the item create/edit form.
- Validate server-side via DTO: positive integers, sane upper bound (e.g. ≤ 5000 mm). Reject anything else (per the main spec's input-validation rules).
- Dimensions are optional at creation but **required before an item can go `live`** in AR.

### 3. Scaling step in the pipeline
Insert into the model pipeline in this exact order:

`download GLB from Tripo → **scale GLB to real size** → convert GLB→USDZ → upload both to R2`

Scaling logic:
- glTF units are **metres**, so convert the stored mm to metres (`mm / 1000`).
- **Scale uniformly** using the single most reliable dimension (default: **width**). Compute the model's current bounding-box width, then the factor `realWidthMeters / currentWidth`, and apply that factor to **all three axes equally**.
- **Do NOT** stretch the bounding box to force exact width, height, and length independently — the AI's proportions are only approximately right, and forcing all three axes distorts the shape. Uniform scale to one trusted axis keeps the model both undistorted and life-size.
- (Recommended) After scaling, translate the model so its **base sits at y = 0**, so it rests naturally on the detected surface in AR instead of floating or sinking.

Illustrative implementation (Node, `@gltf-transform` — use the current library API):
```ts
import { NodeIO, getBounds } from '@gltf-transform/core';

/** realWidthMeters e.g. 0.26 for a 26 cm plate */
async function scaleToRealSize(inPath: string, realWidthMeters: number, outPath: string) {
  const io = new NodeIO();
  const doc = await io.read(inPath);
  const scene = doc.getRoot().listScenes()[0];

  const bbox = getBounds(scene);                 // { min:[x,y,z], max:[x,y,z] }
  const currentWidth = bbox.max[0] - bbox.min[0];
  const factor = realWidthMeters / currentWidth;

  for (const node of scene.listChildren()) {
    const s = node.getScale();
    node.setScale([s[0] * factor, s[1] * factor, s[2] * factor]);
  }
  await io.write(outPath, doc);
}
```
Blender (headless `bpy`) or another glTF tool is an acceptable alternative if it produces the same result. Keep this step server-side.

### 4. AR viewer dimension display (optional but recommended)
In the `<model-viewer>` page, enable dimension annotations / hotspots so the diner sees the real size (e.g. "22 cm wide") on the AR view. This reinforces the product's trust value. Only show it when the item has dimensions.

---

## Acceptance Criteria (Definition of Done)

- `MenuItem` has `width_mm`, `height_mm`, `length_mm` with a migration applied.
- The item form captures and server-side-validates these values; an item cannot be set `live` without them.
- The pipeline scales the GLB to the real width (uniform scale) **before** USDZ conversion; both GLB and USDZ reflect the true size.
- **Verification:** a test item with a known width (e.g. a 260 mm plate) placed in AR measures ~26 cm — not tiny, not giant.
- Model proportions are visibly undistorted after scaling.
- (If implemented) the AR viewer shows correct dimension annotations.
- All existing security, validation, and coding-standard rules from the main spec still hold.

---

## Notes / Out of Scope

- This does **not** require exact per-axis geometric accuracy. For food, uniform-scaling to the real plate width is accurate enough — sub-centimetre differences are unnoticeable.
- When truly exact geometry on every axis is needed (e.g. furniture later), prefer **manufacturer CAD/GLB** or a measured **LiDAR scan** over AI generation — both come out at correct real-world scale already. That path is out of scope for this task but should not be blocked by it.
