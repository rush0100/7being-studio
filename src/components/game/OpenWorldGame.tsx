"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { subscribeEvents } from "@/lib/bci-client";
import {
  actionFromCommand,
  actionFromKey,
  emptyHeld,
  type HeldMoves,
  type MoveAction,
} from "@/lib/game-controls";
import "@/app/game/game.css";

const WORLD = 120;
const SPEED = 9;
const JUMP_V = 8.5;
const GRAVITY = 22;

type Hud = {
  command: string;
  source: string;
  action: MoveAction;
  api: boolean;
};

function hash(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function buildWorld(scene: THREE.Scene) {
  const groundGeo = new THREE.PlaneGeometry(WORLD, WORLD, 48, 48);
  const pos = groundGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const h =
      Math.sin(x * 0.08) * Math.cos(y * 0.07) * 0.55 +
      Math.sin(x * 0.21 + y * 0.13) * 0.22;
    pos.setZ(i, h);
  }
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({
      color: 0x1a3d36,
      flatShading: true,
      roughness: 0.92,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(WORLD, 60, 0x2864ef, 0x1a2740);
  grid.position.y = 0.02;
  (grid.material as THREE.Material).opacity = 0.22;
  (grid.material as THREE.Material).transparent = true;
  scene.add(grid);

  // Scatter trees / rocks
  for (let i = 0; i < 55; i++) {
    const ang = hash(i + 1) * Math.PI * 2;
    const rad = 8 + hash(i + 9) * (WORLD * 0.42);
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    if (Math.hypot(x, z) < 5) continue;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.28, 1.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x5c3a22, flatShading: true }),
    );
    trunk.position.set(x, 0.7, z);
    trunk.castShadow = true;
    scene.add(trunk);

    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(1.1 + hash(i) * 0.6, 2.2, 7),
      new THREE.MeshStandardMaterial({
        color: hash(i + 3) > 0.5 ? 0x22c9a8 : 0x2a8f6e,
        flatShading: true,
      }),
    );
    crown.position.set(x, 2.2, z);
    crown.castShadow = true;
    scene.add(crown);
  }

  for (let i = 0; i < 30; i++) {
    const x = (hash(i + 40) - 0.5) * WORLD * 0.85;
    const z = (hash(i + 70) - 0.5) * WORLD * 0.85;
    if (Math.hypot(x, z) < 4) continue;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.35 + hash(i) * 0.55, 0),
      new THREE.MeshStandardMaterial({ color: 0x6b7385, flatShading: true }),
    );
    rock.position.set(x, 0.25, z);
    rock.rotation.set(hash(i) * 2, hash(i + 1) * 2, 0);
    rock.castShadow = true;
    scene.add(rock);
  }

  // Landmark tower
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 8, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x2864ef, flatShading: true }),
  );
  tower.position.set(18, 4, -14);
  tower.castShadow = true;
  scene.add(tower);
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(1.8, 2.2, 5),
    new THREE.MeshStandardMaterial({ color: 0x22c9a8, flatShading: true }),
  );
  cap.position.set(18, 9.1, -14);
  scene.add(cap);
}

function makePlayer(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.7, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xf7f8f5, flatShading: true }),
  );
  body.position.y = 0.9;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x5b8dff }),
  );
  head.position.y = 1.65;
  head.castShadow = true;
  g.add(head);
  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.1, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x22c9a8 }),
  );
  nose.position.set(0, 1.62, 0.28);
  g.add(nose);
  return g;
}

export function OpenWorldGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const heldRef = useRef<HeldMoves>(emptyHeld());
  const bciActionRef = useRef<MoveAction>("idle");
  const [hud, setHud] = useState<Hud>({
    command: "Neutral",
    source: "—",
    action: "idle",
    api: false,
  });

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a101c);
    scene.fog = new THREE.Fog(0x0a101c, 28, 70);

    const camera = new THREE.PerspectiveCamera(
      55,
      el.clientWidth / Math.max(el.clientHeight, 1),
      0.1,
      200,
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xb8d4ff, 0x1a3d36, 1.05);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.15);
    sun.position.set(20, 30, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    scene.add(sun);

    buildWorld(scene);
    const player = makePlayer();
    scene.add(player);

    const vel = { y: 0 };
    let yaw = 0;
    let onGround = true;
    let last = performance.now();
    let raf = 0;
    let alive = true;

    const applyAction = (action: MoveAction, down: boolean) => {
      const held = heldRef.current;
      if (action === "jump") {
        if (down) held.jumpQueued = true;
        return;
      }
      if (action === "idle") return;
      held[action] = down;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const a = actionFromKey(e.key);
      if (!a) return;
      e.preventDefault();
      applyAction(a, true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const a = actionFromKey(e.key);
      if (!a || a === "jump") return;
      applyAction(a, false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const unsub = subscribeEvents((kind, raw) => {
      if (kind !== "command" && kind !== "history") return;
      const data = raw as { name?: string; source?: string; command?: string };
      const name = String(data.name || data.command || "Neutral");
      const action = actionFromCommand(name);
      bciActionRef.current = action;
      const held = heldRef.current;
      held.forward = action === "forward";
      held.back = action === "back";
      held.left = action === "left";
      held.right = action === "right";
      if (action === "jump") held.jumpQueued = true;
      if (action === "idle") {
        held.forward = held.back = held.left = held.right = false;
      }
      setHud((h) => ({
        ...h,
        command: name,
        source: String(data.source || h.source),
        action,
        api: true,
      }));
    });

    // Probe: if SSE connects we mark api true on first event; optimistic
    setHud((h) => ({ ...h, api: true }));

    const onResize = () => {
      if (!el) return;
      const w = el.clientWidth;
      const h = Math.max(el.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    const tick = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const held = heldRef.current;

      // Keyboard + BCI held
      let mx = 0;
      let mz = 0;
      if (held.forward) mz -= 1;
      if (held.back) mz += 1;
      if (held.left) mx -= 1;
      if (held.right) mx += 1;

      if (mx !== 0 || mz !== 0) {
        const len = Math.hypot(mx, mz) || 1;
        mx /= len;
        mz /= len;
        yaw = Math.atan2(mx, mz);
        player.rotation.y = yaw;
        const spd = SPEED * dt;
        player.position.x += mx * spd;
        player.position.z += mz * spd;
      }

      const lim = WORLD / 2 - 2;
      player.position.x = THREE.MathUtils.clamp(player.position.x, -lim, lim);
      player.position.z = THREE.MathUtils.clamp(player.position.z, -lim, lim);

      if (held.jumpQueued && onGround) {
        vel.y = JUMP_V;
        onGround = false;
      }
      held.jumpQueued = false;

      vel.y -= GRAVITY * dt;
      player.position.y += vel.y * dt;
      if (player.position.y <= 0) {
        player.position.y = 0;
        vel.y = 0;
        onGround = true;
      }

      const camDist = 7.5;
      const camH = 3.2;
      const behindX = player.position.x - Math.sin(yaw) * camDist;
      const behindZ = player.position.z - Math.cos(yaw) * camDist;
      const camTarget = new THREE.Vector3(
        behindX,
        player.position.y + camH,
        behindZ,
      );
      camera.position.lerp(camTarget, 1 - Math.pow(0.001, dt));
      camera.lookAt(
        player.position.x,
        player.position.y + 1.2,
        player.position.z,
      );

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      unsub();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (renderer.domElement.parentElement === el) {
        el.removeChild(renderer.domElement);
      }
    };
  }, []);

  const touch = (action: MoveAction, down: boolean) => {
    const held = heldRef.current;
    if (action === "jump") {
      if (down) held.jumpQueued = true;
      return;
    }
    if (action === "idle") return;
    held[action] = down;
    setHud((h) => ({ ...h, action: down ? action : "idle", source: "touch" }));
  };

  return (
    <div className="game-root">
      <div ref={mountRef} className="game-canvas" />
      <div className="game-hud">
        <div className="game-hud-top">
          <Link href="/" className="game-back">
            ← Studio
          </Link>
          <div className="game-title">
            <strong>7Being World</strong>
            <span>open · web</span>
          </div>
          <div className="game-cmd">
            <span className="game-cmd-name">{hud.command}</span>
            <span className="game-cmd-meta">
              {hud.action} · {hud.source}
            </span>
          </div>
        </div>
        <div className="game-help">
          <kbd>W</kbd>/<kbd>Push</kbd> หน้า · <kbd>S</kbd>/<kbd>Pull</kbd> ถอย ·{" "}
          <kbd>A</kbd>/<kbd>D</kbd> ซ้ายขวา · <kbd>Space</kbd>/<kbd>Blink</kbd>{" "}
          กระโดด
        </div>
        <div className="game-pad" aria-label="ทัชคอนโทรล">
          <button
            type="button"
            className="game-pad-btn"
            onPointerDown={() => touch("forward", true)}
            onPointerUp={() => touch("forward", false)}
            onPointerLeave={() => touch("forward", false)}
          >
            ▲
          </button>
          <div className="game-pad-mid">
            <button
              type="button"
              className="game-pad-btn"
              onPointerDown={() => touch("left", true)}
              onPointerUp={() => touch("left", false)}
              onPointerLeave={() => touch("left", false)}
            >
              ◀
            </button>
            <button
              type="button"
              className="game-pad-btn jump"
              onPointerDown={() => touch("jump", true)}
            >
              กระโดด
            </button>
            <button
              type="button"
              className="game-pad-btn"
              onPointerDown={() => touch("right", true)}
              onPointerUp={() => touch("right", false)}
              onPointerLeave={() => touch("right", false)}
            >
              ▶
            </button>
          </div>
          <button
            type="button"
            className="game-pad-btn"
            onPointerDown={() => touch("back", true)}
            onPointerUp={() => touch("back", false)}
            onPointerLeave={() => touch("back", false)}
          >
            ▼
          </button>
        </div>
      </div>
    </div>
  );
}
