import { useEffect, useRef, type CSSProperties } from 'react';
import * as THREE from 'three';

type Props = {
  className?: string;
  style?: CSSProperties;
};

const SLICE_ANGLE = 1.18;
const FILL_RADIUS = 2.72;
const CRUST_RADIUS = 3.08;
const DEPTH = 0.42;
const MODEL_X_OFFSET = -1.38;

function readCssColor(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function makeSectorShape(radius: number) {
  const start = -SLICE_ANGLE / 2;
  const end = SLICE_ANGLE / 2;
  const shape = new THREE.Shape();

  shape.moveTo(0, 0);
  shape.lineTo(Math.cos(start) * radius, Math.sin(start) * radius);
  shape.absarc(0, 0, radius, start, end, false);
  shape.lineTo(0, 0);

  return shape;
}

function makeCrustShape() {
  const start = -SLICE_ANGLE / 2;
  const end = SLICE_ANGLE / 2;
  const shape = new THREE.Shape();

  shape.moveTo(Math.cos(start) * CRUST_RADIUS, Math.sin(start) * CRUST_RADIUS);
  shape.absarc(0, 0, CRUST_RADIUS, start, end, false);
  shape.lineTo(Math.cos(end) * FILL_RADIUS, Math.sin(end) * FILL_RADIUS);
  shape.absarc(0, 0, FILL_RADIUS, end, start, true);
  shape.closePath();

  return shape;
}

function makeExtrudedGeometry(shape: THREE.Shape, bevelSize: number) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: DEPTH,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize,
    bevelThickness: bevelSize,
    curveSegments: 48,
  });

  geometry.translate(MODEL_X_OFFSET, 0, -DEPTH / 2);
  return geometry;
}

function makeArcPoints(radius: number, z: number, startPad = 0, endPad = 0) {
  const start = -SLICE_ANGLE / 2 + startPad;
  const end = SLICE_ANGLE / 2 - endPad;
  const points: THREE.Vector3[] = [];

  for (let i = 0; i <= 28; i += 1) {
    const t = i / 28;
    const angle = start + (end - start) * t;
    points.push(
      new THREE.Vector3(
        Math.cos(angle) * radius + MODEL_X_OFFSET,
        Math.sin(angle) * radius,
        z,
      ),
    );
  }

  return points;
}

export default function HomePieSlice({ className = '', style }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const trackGeometry = <T extends THREE.BufferGeometry>(geometry: T) => {
      geometries.push(geometry);
      return geometry;
    };
    const trackMaterial = <T extends THREE.Material>(material: T) => {
      materials.push(material);
      return material;
    };

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.width = '100%';
    container.appendChild(renderer.domElement);

    const cherry = readCssColor('--color-cherry', '#C41E3A');
    const cherryDeep = readCssColor('--color-cherry-deep', '#A8172F');
    const cherryGlaze = readCssColor('--color-cherry-glaze', '#F2697C');
    const amber = readCssColor('--color-amber', '#FFA630');
    const amberDeep = readCssColor('--color-amber-deep', '#D28414');
    const cocoa = readCssColor('--color-primary-700', '#271812');

    scene.add(new THREE.HemisphereLight(0xfff6e8, 0x7c1f2d, 2.25));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(-2.8, -3.2, 5.4);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xffc86c, 1.2);
    rimLight.position.set(3.5, 1.2, 3.5);
    scene.add(rimLight);

    const model = new THREE.Group();
    const shadow = new THREE.Mesh(
      trackGeometry(new THREE.CircleGeometry(1, 64)),
      trackMaterial(
        new THREE.MeshBasicMaterial({
          color: cocoa,
          depthWrite: false,
          opacity: 0.13,
          transparent: true,
        }),
      ),
    );
    shadow.position.set(0.3, -1.05, -0.78);
    shadow.scale.set(1.9, 0.32, 1);
    scene.add(shadow);

    const filling = new THREE.Mesh(
      trackGeometry(makeExtrudedGeometry(makeSectorShape(FILL_RADIUS), 0.018)),
      [
        trackMaterial(
          new THREE.MeshStandardMaterial({
            color: cherry,
            metalness: 0.02,
            roughness: 0.45,
          }),
        ),
        trackMaterial(
          new THREE.MeshStandardMaterial({
            color: cherryDeep,
            metalness: 0.02,
            roughness: 0.62,
          }),
        ),
      ],
    );
    model.add(filling);

    const crust = new THREE.Mesh(
      trackGeometry(makeExtrudedGeometry(makeCrustShape(), 0.035)),
      [
        trackMaterial(
          new THREE.MeshStandardMaterial({
            color: amber,
            metalness: 0,
            roughness: 0.68,
          }),
        ),
        trackMaterial(
          new THREE.MeshStandardMaterial({
            color: amberDeep,
            metalness: 0,
            roughness: 0.78,
          }),
        ),
      ],
    );
    model.add(crust);

    const crustRim = new THREE.Mesh(
      trackGeometry(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(makeArcPoints(CRUST_RADIUS - 0.08, DEPTH / 2 + 0.05)),
          40,
          0.085,
          14,
          false,
        ),
      ),
      trackMaterial(
        new THREE.MeshStandardMaterial({
          color: amber,
          metalness: 0,
          roughness: 0.56,
        }),
      ),
    );
    model.add(crustRim);

    const fillingHighlight = new THREE.Mesh(
      trackGeometry(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(makeArcPoints(1.55, DEPTH / 2 + 0.075, 0.18, 0.22)),
          24,
          0.028,
          10,
          false,
        ),
      ),
      trackMaterial(
        new THREE.MeshStandardMaterial({
          color: cherryGlaze,
          depthWrite: false,
          metalness: 0,
          opacity: 0.62,
          roughness: 0.3,
          transparent: true,
        }),
      ),
    );
    model.add(fillingHighlight);

    const baseRotation = {
      x: -0.7,
      y: 0.08,
      z: -0.18,
    };
    model.rotation.set(baseRotation.x, baseRotation.y, baseRotation.z);
    model.position.set(0.05, 0.08, 0);
    scene.add(model);

    camera.position.set(0, 0, 8.1);
    camera.lookAt(0.2, 0, 0);

    const renderScene = () => {
      renderer.render(scene, camera);
    };

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderScene();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    let frameId: number | null = null;
    const clock = new THREE.Clock();

    const animate = () => {
      const time = clock.getElapsedTime();
      model.rotation.x = baseRotation.x + Math.sin(time * 0.62) * 0.035;
      model.rotation.y = baseRotation.y + Math.sin(time * 0.44) * 0.05;
      model.rotation.z = baseRotation.z + Math.sin(time * 0.36) * 0.02;
      model.position.y = 0.08 + Math.sin(time * 0.58) * 0.045;
      shadow.scale.x = 1.9 + Math.sin(time * 0.58) * 0.045;
      shadow.material.opacity = 0.13 - Math.sin(time * 0.58) * 0.012;
      renderScene();
      frameId = window.requestAnimationFrame(animate);
    };

    if (prefersReducedMotion) {
      renderScene();
    } else {
      animate();
    }

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      container.removeChild(renderer.domElement);
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={className}
      style={style}
    />
  );
}
