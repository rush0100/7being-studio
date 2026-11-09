"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type Props = {
  /** Accel-only pitch (deg). */
  pitch: number;
  /** Accel-only roll (deg). */
  roll: number;
};

function makeAxis(
  dir: THREE.Vector3,
  length: number,
  color: number,
  tipColor: number,
): THREE.Group {
  const g = new THREE.Group();
  const shaftLen = length * 0.78;
  const headLen = length - shaftLen;

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, shaftLen, 8),
    new THREE.MeshBasicMaterial({ color }),
  );
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  shaft.position.copy(dir).multiplyScalar(shaftLen * 0.5);
  g.add(shaft);

  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, headLen, 10),
    new THREE.MeshBasicMaterial({ color: tipColor }),
  );
  head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  head.position.copy(dir).multiplyScalar(shaftLen + headLen * 0.5);
  g.add(head);

  return g;
}

function buildTriad(): THREE.Group {
  const root = new THREE.Group();

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0xb8d4e8,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  root.add(sphere);

  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(0.421, 16, 12)),
    new THREE.LineBasicMaterial({
      color: 0x1a1a1a,
      transparent: true,
      opacity: 0.55,
    }),
  );
  root.add(wire);

  const axisLen = 0.95;
  const blue = 0x2f5fd0;
  const red = 0xd62828;
  root.add(makeAxis(new THREE.Vector3(1, 0, 0), axisLen, blue, red));
  root.add(makeAxis(new THREE.Vector3(0, 1, 0), axisLen, blue, red));
  root.add(makeAxis(new THREE.Vector3(0, 0, 1), axisLen, blue, red));

  return root;
}

/** Attitude triad from accelerometer only (pitch/roll). Yaw fixed. */
export function ImuBrainDial({ pitch, roll }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orientRef = useRef({ pitch, roll });
  orientRef.current = { pitch, roll };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    let raf = 0;

    const triad = buildTriad();
    triad.rotation.order = "ZYX";
    let sp = 0;
    let sr = 0;
    let primed = false;

    const scene = new THREE.Scene();
    scene.add(triad);

    const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 20);
    camera.position.set(1.55, 1.15, 1.55);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const fit = () => {
      const parent = canvas.parentElement;
      const w = parent?.clientWidth || 70;
      const h = parent?.clientHeight || 70;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    fit();

    const onResize = () => fit();
    window.addEventListener("resize", onResize);

    const tick = () => {
      if (dead) return;
      raf = requestAnimationFrame(tick);
      const o = orientRef.current;
      if (!primed) {
        sp = o.pitch;
        sr = o.roll;
        primed = true;
      } else {
        const dp = o.pitch - sp;
        const dr = ((o.roll - sr + 540) % 360) - 180;
        // Deadband ~1° — gravity noise stays put.
        if (Math.abs(dp) >= 1 || Math.abs(dr) >= 1) {
          sp += dp * 0.25;
          sr += dr * 0.25;
        }
      }
      // Accel-only: yaw = 0 (accel cannot observe heading).
      triad.rotation.set(
        THREE.MathUtils.degToRad(sr),
        THREE.MathUtils.degToRad(sp),
        0,
        "ZYX",
      );
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      scene.clear();
    };
  }, []);

  return <canvas ref={canvasRef} className="sb-imu-brain-canvas" />;
}
