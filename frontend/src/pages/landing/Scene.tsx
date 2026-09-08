import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import styles from './landing.module.css';

const POINT_COUNT = 1400;

/**
 * The hero's live WebGL scene (spec §3): a wireframe-only icosahedron —
 * "the diamond" — hanging in a starfield of scan points that fills the
 * full page background. The diamond stays a contained, see-through shape
 * (no solid faces, no scene lighting) so it reads as a rotating line-art
 * object rather than a big lit blob covering the hero. Pointer parallax
 * eases the camera toward the cursor; the diamond auto-rotates and floats
 * gently.
 *
 * Everything created here (geometries, materials, renderer) is disposed on
 * unmount and the render loop's rAF is cancelled, per the porting note in
 * spec §3.
 */
export function Scene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 6);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // The "diamond": just the icosahedron's edges, no filled faces — a
    // see-through line-art object rather than a solid lit shape.
    const geometry = new THREE.IcosahedronGeometry(1.9, 0);
    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgesMaterial = new THREE.LineBasicMaterial({
      color: 0x9db4ff,
      transparent: true,
      opacity: 0.55,
    });
    const wireframe = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    scene.add(wireframe);

    // Scan point cloud: ~1,400 points in a spherical shell around the
    // object, evoking an AR scan.
    const pointsGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(POINT_COUNT * 3);
    for (let i = 0; i < POINT_COUNT; i++) {
      const radius = 2.3 + Math.random() * 0.9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
    }
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pointsMaterial = new THREE.PointsMaterial({
      color: 0x4d7cff,
      size: 0.022,
      transparent: true,
      opacity: 0.5,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    scene.add(points);

    // Pointer parallax: camera eases toward the pointer position.
    const pointer = { x: 0, y: 0 };
    const cameraOffset = { x: 0, y: 0 };
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
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    let frameId = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      const elapsed = clock.getElapsedTime();

      if (!reducedMotion) {
        wireframe.rotation.y += 0.0028;
        wireframe.rotation.x += 0.0009;
        points.rotation.y -= 0.0014;
        wireframe.position.y = Math.sin(elapsed * 0.6) * 0.08;
      }

      cameraOffset.x += (pointer.x * 0.6 - cameraOffset.x) * 0.05;
      cameraOffset.y += (-pointer.y * 0.4 - cameraOffset.y) * 0.05;
      camera.position.x = cameraOffset.x;
      camera.position.y = cameraOffset.y;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);
      reducedMotionQuery.removeEventListener('change', handleMotionChange);

      geometry.dispose();
      edgesGeometry.dispose();
      edgesMaterial.dispose();
      pointsGeometry.dispose();
      pointsMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.sceneCanvas} aria-hidden="true" />;
}
