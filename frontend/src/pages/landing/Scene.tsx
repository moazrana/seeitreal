import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import styles from './landing.module.css';

const POINT_COUNT = 1400;

/**
 * The hero's live WebGL scene (spec §3): a faceted icosahedron with a
 * violet wireframe overlay, surrounded by a spherical shell of scan points,
 * lit by three brand-colored point lights. Pointer parallax eases the
 * camera toward the cursor; the object auto-rotates and floats gently.
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

    // The "real" object: a faceted icosahedron with a violet wireframe
    // overlay reading as 3D scan data.
    const geometry = new THREE.IcosahedronGeometry(1.7, 0);
    const material = new THREE.MeshStandardMaterial({
      color: 0x171a27,
      flatShading: true,
      metalness: 0.35,
      roughness: 0.45,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgesMaterial = new THREE.LineBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.65,
    });
    const wireframe = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    mesh.add(wireframe);

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

    // Low ambient + three brand-colored point lights so the gradient rolls
    // across the facets as the object rotates.
    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    const blueLight = new THREE.PointLight(0x4d7cff, 8, 14);
    blueLight.position.set(-3, 2, 3);
    const violetLight = new THREE.PointLight(0x8b5cf6, 8, 14);
    violetLight.position.set(3, -1.5, 2.5);
    const tealLight = new THREE.PointLight(0x2dd4bf, 7, 14);
    tealLight.position.set(0, 3, -2.5);
    scene.add(ambient, blueLight, violetLight, tealLight);

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
        mesh.rotation.y += 0.0028;
        mesh.rotation.x += 0.0009;
        points.rotation.y -= 0.0014;
        mesh.position.y = Math.sin(elapsed * 0.6) * 0.08;
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
      material.dispose();
      edgesGeometry.dispose();
      edgesMaterial.dispose();
      pointsGeometry.dispose();
      pointsMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.sceneCanvas} aria-hidden="true" />;
}
