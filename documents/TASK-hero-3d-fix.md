# Task: Fix the Hero 3D to Match the Reference

**For:** Claude Code.
**Reference:** the approved sample `seeitreal-landing.html` + Design Spec §3. The current hero is close but has two defects — fix both to match the reference exactly.

---

## Problems (from the current build)

1. **Only the wireframe shows — the solid object is missing.** The hero should be a **solid faceted gem** with a thin wireframe *on top* and a point cloud *around* it. Right now there's no visible lit surface, just edge lines — so it reads as a hollow cage. Cause is one (or more) of: the solid mesh was never added, the **lights are missing** (a dark material with no lights renders near-invisible), or the material is too matte/dark to catch light.
2. **The object is too large and overflows into the headline.** Its edges run through "See it on the table before you order," hurting readability. It should sit **contained, with breathing room**, and the headline must stay fully legible over any rotation.

---

## Fix — use these exact values

### 1. Solid lit object (this is the missing piece)
Add BOTH the solid mesh and the lights:
```js
// solid faceted gem
const geo = new THREE.IcosahedronGeometry(1.7, 0);      // detail 0 = faceted
const mat = new THREE.MeshStandardMaterial({
  color: 0x151827, metalness: 0.55, roughness: 0.28, flatShading: true
});
const solid = new THREE.Mesh(geo, mat);
group.add(solid);

// thin wireframe OVER the solid (not instead of it)
const wire = new THREE.LineSegments(
  new THREE.EdgesGeometry(geo),
  new THREE.LineBasicMaterial({ color: 0x8B5CF6, transparent: true, opacity: 0.35 })
);
group.add(wire);

// brand-colored lights — WITHOUT these the dark gem is invisible
scene.add(new THREE.AmbientLight(0x404050, 0.6));
const l1 = new THREE.PointLight(0x4D7CFF, 1.2, 50); l1.position.set(-5, 3, 4);  scene.add(l1);
const l2 = new THREE.PointLight(0x8B5CF6, 1.3, 50); l2.position.set(5, -2, 3);  scene.add(l2);
const l3 = new THREE.PointLight(0x2DD4BF, 1.0, 50); l3.position.set(0, 4, -4);  scene.add(l3);
```
The three colored lights are what make the blue→violet→teal gradient roll across the facets as it rotates. **If you see only wireframe, the lights or the solid mesh are missing — that is the bug.**

### 2. Point cloud (keep — it renders fine)
~1,400 points in a spherical shell, radius 2.5–4.4, `PointsMaterial` color `0x4D7CFF`, size `0.035`, opacity `0.7`. Added to the scene (not the group), counter-rotating.

### 3. Camera + scale — keep it contained
```js
const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
camera.position.z = 7;   // object radius 1.7 at z=7 → contained with margin
```
- Do **not** let the object fill the viewport. If it still looks too big on wide screens, **dolly the camera back** (increase `z`) rather than scaling the mesh.
- **Responsive:** on narrow/short viewports, pull the camera further back (e.g. `z = 7 → 9` under ~640px width) so the gem never overflows or crosses the text.

### 4. Headline readability (do both)
- Keep hero **content above the canvas** (`z-index`) — canvas is `alpha:true` behind it.
- Add a **radial scrim behind the H1** so text always pops regardless of rotation:
```css
.hero-inner{ position:relative; }
.hero-inner::before{
  content:""; position:absolute; inset:-8% -12%; z-index:-1;
  background:radial-gradient(ellipse 70% 70% at 50% 50%, rgba(10,11,20,.72), transparent 70%);
}
```

### 5. Motion (match the reference feel)
```js
group.rotation.y = t * 0.18;
group.rotation.x = Math.sin(t * 0.4) * 0.12;
points.rotation.y = -t * 0.05;
group.position.y = Math.sin(t * 0.8) * 0.12;      // gentle float
// mouse parallax: ease camera toward pointer
camera.position.x += (mx * 2.2 - camera.position.x) * 0.05;
camera.position.y += (-my * 1.6 - camera.position.y) * 0.05;
camera.lookAt(0, 0, 0);
```
Respect `prefers-reduced-motion`: stop rotation/float/scan-line, keep a static lit gem.

### 6. Keep as-is (already correct in the screenshot)
Starfield point cloud, teal scan-line sweep, AR viewfinder corner brackets, typography, gradient "Start free" button — these render correctly; don't change them.

---

## Acceptance Criteria

- The hero shows a **solid, lit, faceted object** with the blue/violet/teal gradient visibly moving across its facets — **not** a bare wireframe.
- The wireframe sits **on top of** the solid; the point cloud surrounds it.
- The object is **contained** with margin on all screen sizes; its edges never overflow the viewport or cut through the headline.
- The H1 is **fully legible** over the object at every rotation angle (radial scrim in place).
- Rotation, float, mouse parallax, and the scan-line match the reference; reduced-motion disables them.
