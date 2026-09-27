import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { heroSceneTheme } from '@ar-menu/shared';
import type { HeroSceneTheme } from '@ar-menu/shared';
import { useTheme } from '../../context/useTheme';
import styles from './landing.module.css';

const POINT_COUNT = 1400;
const GEM_RADIUS = 1.7;
// Camera distance: the gem (radius 1.7) sits contained with margin at
// z = 7; narrow or short viewports pull back further so it never crowds
// the headline. Dolly the camera — never scale the mesh.
const CAMERA_Z = 7;
const CAMERA_Z_COMPACT = 9;
const COMPACT_MAX_WIDTH = 640;
const COMPACT_MAX_HEIGHT = 560;
const CAMERA_FOV_DEG = 45;
// The gem may span at most this share of the viewport's shorter half-axis.
// The FOV is vertical, so on portrait phones width is the binding axis and
// a fixed z = 9 still let the gem run edge to edge.
const MAX_GEM_FILL = 0.6;

function cameraDistanceFor(width: number, height: number): number {
  const compact = width < COMPACT_MAX_WIDTH || height < COMPACT_MAX_HEIGHT;
  const halfFovTan = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV_DEG / 2));
  const fitDistance = GEM_RADIUS / (MAX_GEM_FILL * halfFovTan * Math.min(1, width / height));
  return Math.max(compact ? CAMERA_Z_COMPACT : CAMERA_Z, fitDistance);
}

// The task's light values were authored for three's legacy lighting. Since
// r155 lights are physically based: punctual intensities must be scaled by
// π and distance decay switched off to reproduce the same look (three's
// documented migration). Without this the gem renders near-black — the
// exact "wireframe only" bug this scene exists to fix.
const LEGACY_LIGHT_SCALE = Math.PI;
const KEY_LIGHTS = [
  { color: 0x4d7cff, position: [-5, 3, 4] },
  { color: 0x8b5cf6, position: [5, -2, 3] },
  { color: 0x2dd4bf, position: [0, 4, -4] },
] as const;

/**
 * The hero's live WebGL scene (documents/TASK-hero-3d-fix.md, design spec
 * §3): a solid faceted gem with a thin wireframe on top, a scan-point cloud
 * around it, and three brand-coloured point lights that roll a
 * blue→violet→teal gradient across the facets as it turns. Pointer parallax
 * eases the camera toward the cursor.
 *
 * Theme-aware (documents/USER-APP-theming.md §5): material and light values
 * come from `heroSceneTheme` in @ar-menu/shared and are re-applied live on
 * toggle without rebuilding the scene. Under prefers-reduced-motion the gem
 * is static — no rotation, float or parallax.
 *
 * Everything created here (geometries, materials, renderer) is disposed on
 * unmount and the render loop's rAF is cancelled.
 */
export function Scene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const applyThemeRef = useRef<((theme: HeroSceneTheme) => void) | null>(null);
  // Read inside the (mount-only) scene effect for the initial look, so the
  // first frame is already correct instead of flashing the dark theme.
  const initialThemeRef = useRef(heroSceneTheme[resolvedTheme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = reducedMotionQuery.matches;
    const handleMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
    };
    reducedMotionQuery.addEventListener('change', handleMotionChange);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, 0.1, 100);
    camera.position.set(0, 0, CAMERA_Z);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // The gem: a solid faceted icosahedron (detail 0 = flat facets) with a
    // thin wireframe over it — not instead of it.
    const group = new THREE.Group();
    scene.add(group);
    const gemGeometry = new THREE.IcosahedronGeometry(GEM_RADIUS, 0);
    const solidMaterial = new THREE.MeshStandardMaterial({ flatShading: true });
    group.add(new THREE.Mesh(gemGeometry, solidMaterial));
    const edgesGeometry = new THREE.EdgesGeometry(gemGeometry);
    const wireMaterial = new THREE.LineBasicMaterial({ transparent: true });
    group.add(new THREE.LineSegments(edgesGeometry, wireMaterial));

    const ambientLight = new THREE.AmbientLight();
    scene.add(ambientLight);
    const keyLights = KEY_LIGHTS.map(({ color, position: [x, y, z] }) => {
      const light = new THREE.PointLight(color, 1, 50, 0);
      light.position.set(x, y, z);
      scene.add(light);
      return light;
    });

    // Scan point cloud: a spherical shell (radius 2.5–4.4) around the gem,
    // in the scene rather than the group so it counter-rotates.
    const pointsGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(POINT_COUNT * 3);
    for (let i = 0; i < POINT_COUNT; i++) {
      const radius = 2.5 + Math.random() * 1.9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
    }
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pointsMaterial = new THREE.PointsMaterial({
      size: 0.035,
      transparent: true,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    scene.add(points);

    const applyTheme = (theme: HeroSceneTheme) => {
      solidMaterial.color.setHex(theme.solidColor);
      solidMaterial.metalness = theme.solidMetalness;
      solidMaterial.roughness = theme.solidRoughness;
      wireMaterial.color.setHex(theme.wireColor);
      wireMaterial.opacity = theme.wireOpacity;
      pointsMaterial.color.setHex(theme.pointColor);
      pointsMaterial.opacity = theme.pointOpacity;
      ambientLight.color.setHex(theme.ambientColor);
      ambientLight.intensity = theme.ambientIntensity * LEGACY_LIGHT_SCALE;
      keyLights.forEach((light, i) => {
        light.intensity = theme.lightIntensities[i] * LEGACY_LIGHT_SCALE;
      });
    };
    applyTheme(initialThemeRef.current);
    applyThemeRef.current = applyTheme;

    // Pointer parallax target, normalized to -1..1 across the hero.
    const pointer = { x: 0, y: 0 };
    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    };
    window.addEventListener('pointermove', handlePointerMove);

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.z = cameraDistanceFor(width, height);
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    let frameId = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      const t = clock.getElapsedTime();

      if (!reducedMotion) {
        group.rotation.y = t * 0.18;
        group.rotation.x = Math.sin(t * 0.4) * 0.12;
        group.position.y = Math.sin(t * 0.8) * 0.12;
        points.rotation.y = -t * 0.05;
        camera.position.x += (pointer.x * 2.2 - camera.position.x) * 0.05;
        camera.position.y += (-pointer.y * 1.6 - camera.position.y) * 0.05;
      }
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      applyThemeRef.current = null;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);
      reducedMotionQuery.removeEventListener('change', handleMotionChange);

      gemGeometry.dispose();
      edgesGeometry.dispose();
      solidMaterial.dispose();
      wireMaterial.dispose();
      pointsGeometry.dispose();
      pointsMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    applyThemeRef.current?.(heroSceneTheme[resolvedTheme]);
  }, [resolvedTheme]);

  return <canvas ref={canvasRef} className={styles.sceneCanvas} aria-hidden="true" />;
}
