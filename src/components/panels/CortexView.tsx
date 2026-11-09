"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import {
  EPOC_SENSORS,
  LOBES,
  VIZ_BANDS,
  meanCq,
  toBandShares,
  type LobeId,
} from "@/lib/cortex-map";

export type BrainPayload = {
  bands?: string[];
  channels?: { name: string; share: number[]; color?: string }[];
  lobes?: { name: string; share: number[]; color?: string }[];
} | null;

type Props = {
  brain: BrainPayload;
  bands?: number[] | null;
  /** 14×[θ,α,β,γ] shares. */
  channelBands?: number[][] | null;
  cq?: (number | null)[];
  battery?: number | null;
  streaming?: boolean;
  channelLabels?: string[];
};

/** Midline forehead, between AF3 and AF4. */
const FPZ_XYZ: [number, number, number] = [0, 0.64, 0.82];
/** Sites farther than this from a live electrode stay dark. */
const SITE_REACH = 0.55;

function isEpocMontage(labels: string[]): boolean {
  if (labels.length !== EPOC_SENSORS.length) return false;
  return labels.every((name, i) => name === EPOC_SENSORS[i].name);
}

function electrodeXyz(name: string): [number, number, number] | null {
  if (name === "Fpz") return FPZ_XYZ;
  const known = EPOC_SENSORS.find((sensor) => sensor.name === name);
  return known ? known.xyz : null;
}

/** Band shares for one EPOC fiber site when the headset is not a 14-ch EPOC. */
function bandsForPartialSite(
  siteIndex: number,
  labels: string[],
  chBands: number[][] | null,
): number[] {
  const [x, y, z] = EPOC_SENSORS[siteIndex].xyz;
  let best = Infinity;
  let bestCh = -1;
  for (let i = 0; i < labels.length; i++) {
    const pos = electrodeXyz(labels[i]);
    if (!pos) continue;
    const dist = Math.hypot(pos[0] - x, pos[1] - y, pos[2] - z);
    if (dist < best) {
      best = dist;
      bestCh = i;
    }
  }
  if (bestCh < 0 || best > SITE_REACH) return [0, 0, 0, 0];
  const raw = chBands?.[bestCh];
  if (!raw) return [0, 0, 0, 0];
  const gain = Math.max(0, 1 - best / SITE_REACH);
  return [0, 1, 2, 3].map((band) => (raw[band] ?? 0) * gain);
}

const MODEL_URL = "/models/brain.glb";
const DRACO_URL = "/models/draco/";

/** Camera framing only — spin is a separate toggle. */
type ViewMode = "front" | "top" | "side";

const VIEW_POS: Record<ViewMode, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0.1, 2.95),
  top: new THREE.Vector3(0, 3.15, 0.1),
  side: new THREE.Vector3(2.85, 0.25, 0.35),
};

/** Soft volumetric sparkles per site — 4 bands × N (θ α β γ). */
const PER_BAND = 14;
const GLOW_PER_SITE = PER_BAND * 4;

type LobeKey = LobeId | "central";

function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function classifyLobe(label: string): LobeKey | null {
  const l = label.toLowerCase();
  if (
    /precentral|superior frontal|middle frontal|inferior frontal|orbital|rectus|frontopolar|frontal|cingulate|aslant/.test(
      l,
    )
  ) {
    return "frontal";
  }
  if (
    /postcentral|superior parietal|inferior parietal|supramarginal|angular|precuneus|parietal|parieto/.test(
      l,
    )
  ) {
    return "parietal";
  }
  if (
    /superior temporal|middle temporal|inferior temporal|transverse temporal|fusiform|temporal|hippocamp|parahippocamp|uncinate|arcuate/.test(
      l,
    )
  ) {
    return "temporal";
  }
  if (/calcarine|cuneus|lingual|occipital|optic radiation/.test(l)) {
    return "occipital";
  }
  if (/central sulcus|insula/.test(l)) return "central";
  return null;
}

function meshExtras(o: THREE.Object3D): Record<string, unknown> {
  const ud = o.userData || {};
  if (ud.bx_cat != null) return ud;
  if (o.parent?.userData?.bx_cat != null) return o.parent.userData;
  return ud;
}

type CortexSample = {
  p: THREE.Vector3;
  lobe: LobeKey | null;
};

/** Sample cortex verts in model-local space, tagged by anatomical lobe. */
function collectCortexSamples(
  model: THREE.Object3D,
  toLocal: THREE.Matrix4,
): CortexSample[] {
  const out: CortexSample[] = [];
  const tmp = new THREE.Vector3();
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    const ex = meshExtras(o);
    const cat = String(ex.bx_cat || "cortex");
    if (cat !== "cortex") return;
    const label = String(ex.bx_label || o.name || "");
    const lobe = classifyLobe(label);
    const pos = o.geometry.attributes.position;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 2800));
    for (let i = 0; i < pos.count; i += step) {
      tmp.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      out.push({ p: tmp.clone().applyMatrix4(toLocal), lobe });
    }
  });
  return out;
}

function meanOf(
  samples: CortexSample[],
  pred: (s: CortexSample) => boolean,
): THREE.Vector3 | null {
  let n = 0;
  const m = new THREE.Vector3();
  for (const s of samples) {
    if (!pred(s)) continue;
    m.add(s.p);
    n += 1;
  }
  if (!n) return null;
  return m.multiplyScalar(1 / n);
}

/**
 * Fixed anatomical axes for this Brain Project GLB (after centering).
 * Only flips signs from lobe means — never rebuilds a free basis
 * (free rebuild collapsed every marker onto the superior pole).
 */
function anatomicalBasis(samples: CortexSample[]): {
  right: THREE.Vector3;
  up: THREE.Vector3;
  ant: THREE.Vector3;
} {
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const ant = new THREE.Vector3(0, 0, 1);

  const front = meanOf(samples, (s) => s.lobe === "frontal");
  const back = meanOf(samples, (s) => s.lobe === "occipital");
  if (front && back) {
    const d = front.clone().sub(back);
    if (Math.abs(d.z) >= Math.abs(d.x) && Math.abs(d.z) >= Math.abs(d.y)) {
      if (d.z < 0) ant.negate();
    } else if (Math.abs(d.x) >= Math.abs(d.y)) {
      // Anterior lies on ±X in this asset.
      ant.set(Math.sign(d.x) || 1, 0, 0);
      right.set(0, 0, -(Math.sign(d.x) || 1));
    }
  }

  const leftT = meanOf(samples, (s) => s.lobe === "temporal" && s.p.x < 0);
  const rightT = meanOf(samples, (s) => s.lobe === "temporal" && s.p.x > 0);
  if (leftT && rightT) {
    const hemi = rightT.clone().sub(leftT);
    if (hemi.dot(right) < 0) right.negate();
  }

  return { right, up, ant };
}

type SensorSite = {
  index: number;
  name: string;
  lobe: LobeId;
  pos: THREE.Vector3;
};

type GlowCloud = {
  nodePos: Float32Array;
  nodeCol: Float32Array;
  nodeSize: Float32Array;
  nodeSensor: Uint8Array;
  /** 0=θ 1=α 2=β 3=γ — each spark is one band’s light. */
  nodeBand: Uint8Array;
  nodePhase: Float32Array;
  nodeBase: Float32Array;
  nodeCount: number;
};

/**
 * Soft volumetric glow: every site gets layered θ/α/β/γ sparkles
 * (cool→warm palette), so each lobe lights as those four bands.
 */
function buildGlowCloud(sites: THREE.Vector3[], radius: number): GlowCloud {
  const count = sites.length * GLOW_PER_SITE;
  const nodePos = new Float32Array(count * 3);
  const nodeCol = new Float32Array(count * 3);
  const nodeSize = new Float32Array(count);
  const nodeSensor = new Uint8Array(count);
  const nodeBand = new Uint8Array(count);
  const nodePhase = new Float32Array(count);
  const nodeBase = new Float32Array(count);
  const side = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let ni = 0;

  for (let s = 0; s < sites.length; s++) {
    const origin = sites[s];
    const outward =
      origin.lengthSq() > 1e-8
        ? origin.clone().normalize()
        : new THREE.Vector3(0, 1, 0);
    side.crossVectors(up, outward);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    else side.normalize();
    const bitan = tmp.copy(outward).cross(side).normalize();

    for (let band = 0; band < 4; band++) {
      // Cool bands sit slightly deeper; warm bands a bit more superficial.
      const depthBias = (band < 2 ? 0.08 : 0.01) * radius;
      const spread = radius * (0.18 + band * 0.028);
      const rgb = VIZ_BANDS[band].rgb;

      for (let k = 0; k < PER_BAND; k++) {
        const seed = s * 91.7 + band * 17.3 + k * 4.13;
        const jx =
          (hash01(seed) + hash01(seed + 0.3) + hash01(seed + 0.7) - 1.5) * spread;
        const jy =
          (hash01(seed + 1.1) + hash01(seed + 1.4) + hash01(seed + 1.8) - 1.5) *
          spread *
          0.85;
        const jz =
          (hash01(seed + 2.2) + hash01(seed + 2.5) + hash01(seed + 2.9) - 1.5) *
          spread;
        const inward = depthBias + hash01(seed + 3.3) * spread * 0.45;
        const p = origin
          .clone()
          .addScaledVector(side, jx)
          .addScaledVector(bitan, jy)
          .addScaledVector(outward, jz - inward);
        const maxR = radius * 0.9;
        if (p.length() > maxR) {
          p.setLength(maxR * (0.82 + hash01(seed + 4) * 0.1));
        }

        nodePos[ni * 3] = p.x;
        nodePos[ni * 3 + 1] = p.y;
        nodePos[ni * 3 + 2] = p.z;
        nodeCol[ni * 3] = rgb[0];
        nodeCol[ni * 3 + 1] = rgb[1];
        nodeCol[ni * 3 + 2] = rgb[2];
        nodeSize[ni] = 0.7 + hash01(seed + 5) * 1.15;
        nodeSensor[ni] = s;
        nodeBand[ni] = band;
        nodePhase[ni] = hash01(seed + 6) * Math.PI * 2;
        nodeBase[ni] = 0.35 + hash01(seed + 7) * 0.65;
        ni += 1;
      }
    }
  }

  return {
    nodePos,
    nodeCol,
    nodeSize,
    nodeSensor,
    nodeBand,
    nodePhase,
    nodeBase,
    nodeCount: ni,
  };
}

function ActivityBrain({
  channelBands,
  levels,
  gains,
  view,
  autoSpin,
  focusLobe,
  channelLabels,
  onStatus,
}: {
  channelBands: number[][] | null;
  levels: number[];
  gains: number[];
  view: ViewMode;
  autoSpin: boolean;
  focusLobe: LobeId | null;
  channelLabels: string[];
  onStatus: (s: "loading" | "ready" | "error") => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const bandsRef = useRef(channelBands);
  const levelsRef = useRef(levels);
  const gainsRef = useRef(gains);
  const lobeRef = useRef(focusLobe);
  const viewRef = useRef(view);
  const spinRef = useRef(autoSpin);
  const labelsRef = useRef(channelLabels);
  const apiRef = useRef<{ setView: (v: ViewMode) => void } | null>(null);

  bandsRef.current = channelBands;
  levelsRef.current = levels;
  gainsRef.current = gains;
  lobeRef.current = focusLobe;
  viewRef.current = view;
  spinRef.current = autoSpin;
  labelsRef.current = channelLabels;

  useEffect(() => {
    const host = wrapRef.current;
    if (!host) return;

    let dead = false;
    let raf = 0;
    onStatus("loading");

    // Own canvas (not the React-managed node) — avoids Strict Mode
    // dispose() killing the WebGL context that the remount still needs.
    const canvas = document.createElement("canvas");
    canvas.className = "sb-cortex-canvas";
    host.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    // Studio grey — not pitch black.
    renderer.setClearColor(0x2c2e32, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 80);
    camera.position.copy(VIEW_POS[viewRef.current]);

    scene.add(new THREE.AmbientLight(0x6a7078, 0.85));
    const key = new THREE.DirectionalLight(0xe8ecef, 0.55);
    key.position.set(3.5, 5.5, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8a929c, 0.28);
    fill.position.set(-5, 1.5, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x5a7a98, 0.22);
    rim.position.set(-2, 2, -6);
    scene.add(rim);

    const root = new THREE.Group();
    scene.add(root);

    const controls = new OrbitControls(camera, canvas);
    controls.enablePan = false;
    controls.minDistance = 2.2;
    controls.maxDistance = 7.5;
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.72;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.update();

    const clock = new THREE.Clock();
    let fiberNodes: THREE.Points | null = null;
    let fiberMeta: GlowCloud | null = null;
    let nodeSizeAttr: THREE.BufferAttribute | null = null;
    const sites: SensorSite[] = [];
    const cortexMats: {
      mat: THREE.MeshStandardMaterial;
      lobe: LobeKey | null;
      base: THREE.Color;
    }[] = [];

    const frameCamera = (v: ViewMode) => {
      const parent = canvas.parentElement;
      const w = Math.max(1, parent?.clientWidth || 320);
      const h = Math.max(1, parent?.clientHeight || 280);
      const portrait = h / w > 1.05;
      // Mobile portrait: wider FOV + pull back so cortex fills the stage.
      camera.fov = portrait ? 46 : 36;
      const base = VIEW_POS[v];
      const dist = portrait ? 1.22 : 1;
      camera.position.set(base.x * dist, base.y * dist, base.z * dist);
      controls.target.set(0, 0.02, 0);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      controls.update();
    };

    const resize = () => {
      const parent = canvas.parentElement;
      const w = Math.max(1, parent?.clientWidth || canvas.clientWidth || 320);
      const h = Math.max(1, parent?.clientHeight || canvas.clientHeight || 280);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(w, h, false);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      frameCamera(viewRef.current);
    };
    resize();

    const setView = (v: ViewMode) => {
      frameCamera(v);
    };
    apiRef.current = { setView };

    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_URL);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);

    loader.load(
      MODEL_URL,
      (gltf) => {
        if (dead) return;
        const model = gltf.scene.clone(true);

        model.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const ex = meshExtras(o);
          const cat = String(ex.bx_cat || "cortex");
          const label = String(ex.bx_label || o.name || "");

          if (cat !== "cortex" && cat !== "white_matter" && cat !== "deep_grey") {
            o.visible = false;
            return;
          }

          // Translucent charcoal shell + teal deep core; fibers glow inside.
          const isCortex = cat === "cortex";
          const isDeep = cat === "deep_grey" || cat === "white_matter";
          const shade = isCortex ? 0.28 : cat === "white_matter" ? 0.22 : 0.28;
          const base = isDeep
            ? new THREE.Color("#2e6a75").multiplyScalar(shade)
            : new THREE.Color("#8a929e").multiplyScalar(shade);
          const mat = new THREE.MeshStandardMaterial({
            color: base,
            roughness: isDeep ? 0.55 : 0.9,
            metalness: isDeep ? 0.08 : 0.02,
            emissive: new THREE.Color(isDeep ? "#0e3a42" : "#101820"),
            emissiveIntensity: isCortex ? 0.12 : isDeep ? 0.22 : 0.08,
            transparent: true,
            opacity: isCortex ? 0.14 : isDeep ? 0.22 : 0.1,
            depthWrite: isCortex,
            side: THREE.FrontSide,
          });
          o.material = mat;
          if (isCortex) {
            cortexMats.push({ mat, lobe: classifyLobe(label), base: base.clone() });
          }
        });

        // Pivot keeps facing + centering correct for nested GLB transforms.
        const pivot = new THREE.Group();
        root.add(pivot);
        pivot.add(model);
        model.rotation.y = Math.PI;

        // Center cortex at root origin (root-local; do this before uniform scale).
        pivot.position.set(0, 0, 0);
        root.scale.setScalar(1);
        pivot.updateMatrixWorld(true);
        {
          const box = new THREE.Box3();
          model.traverse((o) => {
            if (o instanceof THREE.Mesh && o.visible) box.expandByObject(o);
          });
          if (box.isEmpty()) box.setFromObject(model);
          const mid = box.getCenter(new THREE.Vector3());
          root.worldToLocal(mid);
          pivot.position.copy(mid).multiplyScalar(-1);
          pivot.updateMatrixWorld(true);
        }

        const invPivot = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
        const samples = collectCortexSamples(model, invPivot);
        const centroid = new THREE.Vector3();
        for (const sm of samples) centroid.add(sm.p);
        if (samples.length) centroid.multiplyScalar(1 / samples.length);

        let localR = 0;
        for (const sm of samples) {
          localR = Math.max(localR, sm.p.distanceTo(centroid));
        }
        if (!(localR > 1e-6)) {
          localR =
            new THREE.Box3()
              .setFromObject(model)
              .getBoundingSphere(new THREE.Sphere()).radius || 1;
        }

        // Fit the whole cortex in frame.
        root.scale.setScalar(1.25 / localR);
        // Glow origin = cortex centroid in pivot-local (NOT pivot 0,0,0).
        const glowRig = new THREE.Group();
        glowRig.position.copy(centroid);
        pivot.add(glowRig);
        root.updateMatrixWorld(true);

        const { right, up, ant } = anatomicalBasis(samples);
        const names = labelsRef.current.length
          ? labelsRef.current
          : EPOC_SENSORS.map((s) => s.name);
        const sitePositions: THREE.Vector3[] = [];

        for (let s = 0; s < EPOC_SENSORS.length; s++) {
          const sensor = EPOC_SENSORS[s];
          const [rx, uy, az] = sensor.xyz;
          const pos = new THREE.Vector3()
            .addScaledVector(right, rx)
            .addScaledVector(up, uy * 0.72)
            .addScaledVector(ant, az);
          if (pos.lengthSq() < 1e-8) pos.set(rx, uy, az);
          // Sit inside translucent shell — fibers grow from here.
          pos.normalize().multiplyScalar(localR * 0.72);
          sitePositions.push(pos.clone());
          sites.push({
            index: s,
            name: names[s] || sensor.name,
            lobe: sensor.lobe,
            pos: pos.clone(),
          });
        }

        fiberMeta = buildGlowCloud(sitePositions, localR);
        const nodeGeo = new THREE.BufferGeometry();
        nodeGeo.setAttribute(
          "position",
          new THREE.BufferAttribute(fiberMeta.nodePos, 3),
        );
        nodeGeo.setAttribute(
          "aColor",
          new THREE.BufferAttribute(fiberMeta.nodeCol, 3),
        );
        nodeSizeAttr = new THREE.BufferAttribute(fiberMeta.nodeSize, 1);
        nodeGeo.setAttribute("size", nodeSizeAttr);
        const nodeMat = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          depthTest: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
          uniforms: {
            uSize: { value: 16 },
            uOpacity: { value: 0.82 },
          },
          vertexShader: `
            attribute float size;
            attribute vec3 aColor;
            varying vec3 vColor;
            varying float vAlpha;
            uniform float uSize;
            void main() {
              vColor = aColor;
              vAlpha = clamp(size * 0.55, 0.06, 1.0);
              vec4 mv = modelViewMatrix * vec4(position, 1.0);
              gl_PointSize = clamp(uSize * size * (0.85 / max(0.28, -mv.z)), 6.0, 64.0);
              gl_Position = projectionMatrix * mv;
            }
          `,
          fragmentShader: `
            varying vec3 vColor;
            varying float vAlpha;
            uniform float uOpacity;
            void main() {
              vec2 p = gl_PointCoord * 2.0 - 1.0;
              float d = dot(p, p);
              if (d > 1.0) discard;
              float soft = exp(-d * 2.4);
              gl_FragColor = vec4(vColor, soft * vAlpha * uOpacity);
            }
          `,
        });
        fiberNodes = new THREE.Points(nodeGeo, nodeMat);
        fiberNodes.frustumCulled = false;
        fiberNodes.renderOrder = 11;
        glowRig.add(fiberNodes);

        root.updateMatrixWorld(true);
        controls.target.set(0, 0, 0);
        controls.update();

        const w0 = sites[0]
          ? sites[0].pos
              .clone()
              .add(centroid)
              .applyMatrix4(pivot.matrixWorld)
          : new THREE.Vector3();
        let meshCount = 0;
        const cortexBox = new THREE.Box3();
        model.traverse((o) => {
          if (o instanceof THREE.Mesh && o.visible) {
            meshCount += 1;
            cortexBox.expandByObject(o);
          }
        });
        (window as unknown as { __brainvizDebug?: unknown }).__brainvizDebug = {
          sites: sites.length,
          glowNodes: fiberMeta.nodeCount,
          AF3world: w0.toArray(),
          AF3wlen: w0.length(),
          localR,
          centroid: centroid.toArray(),
          meshCount,
          boxMin: cortexBox.min.toArray(),
          boxMax: cortexBox.max.toArray(),
          boxCenter: cortexBox.getCenter(new THREE.Vector3()).toArray(),
          cam: camera.position.toArray(),
          rootScale: root.scale.x,
          rootChildren: root.children.length,
          pivotPos: pivot.position.toArray(),
        };

        // Sample framebuffer after a couple frames (own GL context).
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (dead) return;
            renderer.render(scene, camera);
            const gl = renderer.getContext();
            const buf = new Uint8Array(4);
            const w = renderer.domElement.width;
            const h = renderer.domElement.height;
            gl.readPixels((w / 2) | 0, (h / 2) | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            const dbg = (window as unknown as { __brainvizDebug?: Record<string, unknown> })
              .__brainvizDebug;
            if (dbg) dbg.midPx = Array.from(buf);
          });
        });

        onStatus("ready");
        setView(viewRef.current);
        resize();
      },
      undefined,
      () => {
        if (!dead) onStatus("error");
      },
    );

    const tick = () => {
      if (dead) return;
      raf = requestAnimationFrame(tick);
      try {
      const t = clock.getElapsedTime();
      const chBands = bandsRef.current;
      const levels = levelsRef.current;
      const gains = gainsRef.current;
      const focus = lobeRef.current;
      const liveLabels = labelsRef.current;
      const epocMontage = isEpocMontage(liveLabels);
      const pulse = 0.55 + 0.45 * Math.sin(t * 2.6);

      for (const entry of cortexMats) {
        const on =
          !focus ||
          entry.lobe === focus ||
          (focus === "frontal" && entry.lobe === "central");
        if (focus) {
          // Selected lobe is a solid cyan wash; the rest stays dim.
          entry.mat.color.copy(entry.base).multiplyScalar(on ? 0.55 : 0.22);
          entry.mat.opacity = on ? 0.55 : 0.06;
          entry.mat.emissiveIntensity = on ? 0.85 : 0.03;
          entry.mat.emissive.set(on ? "#3ad4ee" : "#080c12");
          entry.mat.depthWrite = on;
        } else {
          entry.mat.color.copy(entry.base);
          entry.mat.opacity = 0.14;
          entry.mat.emissiveIntensity = 0.12;
          entry.mat.emissive.set("#101820");
          entry.mat.depthWrite = false;
        }
      }

      // Per-site θ/α/β/γ shares, cool→warm lights per lobe.
      const siteShares: number[][] = [];
      let meanE = 0;
      for (const site of sites) {
        const raw = epocMontage
          ? chBands?.[site.index] || levels
          : bandsForPartialSite(site.index, liveLabels, chBands);
        const shares = [0, 1, 2, 3].map((b) =>
          Math.max(0, (raw[b] ?? 0) * (gains[b] ?? 1)),
        );
        const lobeDim =
          !focus || EPOC_SENSORS[site.index].lobe === focus ? 1 : 0.04;
        siteShares.push(shares.map((v) => v * lobeDim));
        meanE += shares.reduce((a, b) => a + b, 0) * lobeDim;
      }
      meanE /= Math.max(1, sites.length);

      if (fiberNodes && fiberMeta && nodeSizeAttr) {
        const sizes = nodeSizeAttr.array as Float32Array;
        const cols = (
          fiberNodes.geometry.getAttribute("aColor") as THREE.BufferAttribute
        ).array as Float32Array;
        const {
          nodeSensor,
          nodeBand,
          nodePhase,
          nodeBase,
          nodeCount,
        } = fiberMeta;
        for (let i = 0; i < nodeCount; i++) {
          const s = nodeSensor[i];
          const band = nodeBand[i];
          const shares = siteShares[s] || [0, 0, 0, 0];
          const bandE = shares[band] ?? 0;
          const rgb = VIZ_BANDS[band].rgb;
          const flicker =
            0.55 + 0.45 * Math.sin(t * (2.4 + band * 0.35) + nodePhase[i]) * pulse;
          // This spark IS that band’s light — size/brightness = θ|α|β|γ only.
          const live = Math.min(1.45, Math.sqrt(bandE) * nodeBase[i] * flicker * 1.55);
          if (live < 0.04) {
            sizes[i] = 0.04;
            cols[i * 3] = rgb[0] * 0.2;
            cols[i * 3 + 1] = rgb[1] * 0.2;
            cols[i * 3 + 2] = rgb[2] * 0.2;
            continue;
          }
          sizes[i] = 0.9 + live * 2.9;
          const hot = live > 1.05 ? (live - 1.05) * 0.65 : 0;
          cols[i * 3] = Math.min(1, rgb[0] * (0.65 + live * 0.5) + hot);
          cols[i * 3 + 1] = Math.min(1, rgb[1] * (0.65 + live * 0.5) + hot * 0.5);
          cols[i * 3 + 2] = Math.min(1, rgb[2] * (0.65 + live * 0.5) + hot * 0.3);
        }
        nodeSizeAttr.needsUpdate = true;
        fiberNodes.geometry.getAttribute("aColor").needsUpdate = true;
        const mat = fiberNodes.material as THREE.ShaderMaterial;
        mat.uniforms.uSize.value = 22 + 6 * pulse;
        mat.uniforms.uOpacity.value = 0.55 + 0.4 * Math.min(1, meanE);
      }

      // Spin toggle — independent of camera view (side/top/front).
      if (spinRef.current) {
        root.rotation.y = t * 0.32;
      } else if (Math.abs(root.rotation.y) > 1e-4) {
        root.rotation.y *= 0.88;
        if (Math.abs(root.rotation.y) < 1e-3) root.rotation.y = 0;
      }

      controls.update();
      renderer.render(scene, camera);
      } catch (err) {
        (window as unknown as { __bvErrs?: string[] }).__bvErrs = [
          ...(((window as unknown as { __bvErrs?: string[] }).__bvErrs) || []).slice(-4),
          String(err),
        ];
      }
    };
    tick();

    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener("resize", resize);

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      ro.disconnect();
      controls.dispose();
      draco.dispose();
      if (fiberNodes) {
        fiberNodes.geometry.dispose();
        (fiberNodes.material as THREE.Material).dispose();
      }
      renderer.dispose();
      canvas.remove();
      apiRef.current = null;
    };
  }, [onStatus]);

  useEffect(() => {
    apiRef.current?.setView(view);
  }, [view]);

  return <div ref={wrapRef} className="sb-cortex-stage" />;
}

function CqMap({
  labels,
  values,
  onClose,
}: {
  labels: string[];
  values: (number | null)[];
  onClose: () => void;
}) {
  return (
    <div className="sb-cortex-cqmap" role="dialog" aria-label="Contact quality">
      <div className="sb-cortex-cqmap-head">
        <strong>Contact quality</strong>
        <button type="button" className="sb-cortex-iconbtn" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="sb-cortex-cqmap-grid">
        {labels.slice(0, 14).map((name, i) => {
          const raw = values[i];
          const v =
            raw == null || !Number.isFinite(Number(raw))
              ? null
              : Math.max(0, Math.min(1, Number(raw)));
          const tone =
            v == null ? "null" : v >= 0.7 ? "good" : v >= 0.4 ? "mid" : "bad";
          return (
            <div key={name} className="sb-cortex-cqmap-cell" title={`${name}: ${v ?? "—"}`}>
              <span className={`sb-cortex-cqmap-pip ${tone}`} />
              <span>{name}</span>
            </div>
          );
        })}
      </div>
      <p className="sb-cortex-cqmap-legend">
        เขียว=ดี · ส้ม=ปานกลาง · แดง=แย่ — คุณภาพหน้าสัมผัส
      </p>
    </div>
  );
}

/** Per-sensor θ/α/β/γ on the 3D cortex, plus contact, battery, and lobes. */
export function CortexView({
  brain: _brain,
  bands,
  channelBands,
  cq,
  battery,
  streaming,
  channelLabels,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewMode>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches
      ? "front"
      : "side",
  );
  const [autoSpin, setAutoSpin] = useState(false);
  const [showBands, setShowBands] = useState(true);
  const [showCq, setShowCq] = useState(false);
  const [focusLobe, setFocusLobe] = useState<LobeId | null>(null);
  const [gains, setGains] = useState([1, 1, 1, 1]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [fs, setFs] = useState(false);

  const levels = useMemo(() => {
    const q = toBandShares(bands);
    const energy = q.reduce((a, b) => a + b, 0);
    // Idle demo: cyan trunks + magenta tips.
    if (!streaming || energy < 0.18) return [0.15, 0.38, 0.28, 0.16];
    return q.map((v) => Math.max(0.05, Math.min(1, v * 1.15)));
  }, [bands, streaming]);

  const cqScore = useMemo(() => {
    const m = meanCq(cq);
    return m == null ? null : Math.round(m * 100);
  }, [cq]);

  const labels =
    channelLabels && channelLabels.length
      ? channelLabels
      : EPOC_SENSORS.map((s) => s.name);

  const toggleFs = useCallback(async () => {
    const el = rootRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
      setFs(true);
    } else {
      await document.exitFullscreen?.();
      setFs(false);
    }
  }, []);

  useEffect(() => {
    const onFs = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  return (
    <div
      ref={rootRef}
      className={`sb-cortex sb-cortex--activity${fs ? " is-fs" : ""}`}
    >
      <div className="sb-cortex-hud-top">
        <div className="sb-cortex-hud-left">
          <span className="sb-cortex-brand">สมอง</span>
          <div className="sb-cortex-lobes" role="tablist" aria-label="Brain areas">
            <button
              type="button"
              className={`sb-cortex-lobe${focusLobe == null ? " is-on" : ""}`}
              onClick={() => setFocusLobe(null)}
            >
              All
            </button>
            {LOBES.map((l) => (
              <button
                key={l.id}
                type="button"
                className={`sb-cortex-lobe${focusLobe === l.id ? " is-on" : ""}`}
                title={l.blurb}
                onClick={() =>
                  setFocusLobe((cur) => (cur === l.id ? null : l.id))
                }
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sb-cortex-hud-right">
          <div className="sb-cortex-views" role="toolbar" aria-label="มุมกล้อง">
            <button
              type="button"
              className={`sb-cortex-iconbtn sb-cortex-spin${autoSpin ? " is-on" : ""}`}
              aria-pressed={autoSpin}
              title={autoSpin ? "กำลังหมุน — กดเพื่อหยุด" : "หยุดนิ่ง — กดเพื่อหมุน"}
              onClick={() => setAutoSpin((v) => !v)}
            >
              {autoSpin ? "หมุน" : "หยุด"}
            </button>
            {(
              [
                { id: "side" as const, label: "ด้าน", title: "มุมด้าน" },
                { id: "top" as const, label: "บน", title: "มุมบน" },
                { id: "front" as const, label: "หน้า", title: "มุมหน้า" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                className={`sb-cortex-iconbtn${view === m.id ? " is-on" : ""}`}
                onClick={() => setView(m.id)}
                title={m.title}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="sb-cortex-badges">
            <span
              className={`sb-cortex-batt${streaming ? " is-on" : ""}`}
              title={
                battery != null ? `Battery ${battery}%` : "Headset battery"
              }
            >
              <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden>
                <rect
                  x="0.5"
                  y="1.5"
                  width="14"
                  height="7"
                  rx="1.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <rect
                  x="15.2"
                  y="3.2"
                  width="1.8"
                  height="3.6"
                  rx="0.4"
                  fill="currentColor"
                />
                <rect
                  x="2"
                  y="3"
                  width={
                    battery != null
                      ? Math.max(2, (battery / 100) * 10)
                      : streaming
                        ? 10
                        : 4
                  }
                  height="4"
                  rx="0.6"
                  fill="currentColor"
                />
              </svg>
              {battery != null ? <em>{battery}%</em> : null}
            </span>
            <button
              type="button"
              className="sb-cortex-cq"
              title="Contact quality — tap for map"
              onClick={() => setShowCq((v) => !v)}
            >
              {cqScore != null ? cqScore : "—"}
            </button>
          </div>
        </div>
      </div>

      {status === "error" ? (
        <p className="sb-cortex-empty">โหลดโมเดลสมองไม่สำเร็จ</p>
      ) : (
        <ActivityBrain
          channelBands={channelBands || null}
          levels={levels}
          view={view}
          autoSpin={autoSpin}
          gains={gains}
          focusLobe={focusLobe}
          channelLabels={labels}
          onStatus={setStatus}
        />
      )}

      {status === "loading" ? (
        <p className="sb-cortex-empty">กำลังโหลดสมอง 3D…</p>
      ) : null}

      {showCq ? (
        <CqMap
          labels={labels}
          values={cq || []}
          onClose={() => setShowCq(false)}
        />
      ) : null}

      {focusLobe ? (
        <p className="sb-cortex-lobe-blurb">
          {LOBES.find((l) => l.id === focusLobe)?.label}:{" "}
          {LOBES.find((l) => l.id === focusLobe)?.blurb}
        </p>
      ) : null}

      <div className="sb-cortex-hud-bottom">
        {showBands ? (
          <div className="sb-cortex-bands" aria-label="Frequencies controller">
            {VIZ_BANDS.map((b, i) => {
              const v = Math.max(0, Math.min(1, levels[i] * gains[i]));
              return (
                <label key={b.key} className="sb-cortex-band" title={`${b.name} ${b.hz} — ${b.blurb}`}>
                  <span style={{ color: b.color }}>{b.label}</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={gains[i]}
                    aria-label={`${b.name} gain`}
                    style={
                      {
                        "--band": b.color,
                        "--fill": `${v * 100}%`,
                      } as CSSProperties
                    }
                    onChange={(e) => {
                      const next = [...gains];
                      next[i] = Number(e.target.value);
                      setGains(next);
                    }}
                  />
                </label>
              );
            })}
            <p className="sb-cortex-band-hint">
              cool→warm · เลื่อนซ้ายสุด = ปิดแบนด์
            </p>
          </div>
        ) : null}

        <div className="sb-cortex-tools">
          <button
            type="button"
            className="sb-cortex-iconbtn"
            title="Fullscreen"
            onClick={() => void toggleFs()}
          >
            {fs ? "⤵" : "⤢"}
          </button>
          <button
            type="button"
            className={`sb-cortex-iconbtn${showBands ? " is-on" : ""}`}
            title="Frequencies controller"
            onClick={() => setShowBands((v) => !v)}
          >
            ▤
          </button>
          <span
            className={`sb-cortex-live${streaming ? " is-on" : ""}`}
            title={streaming ? "Live" : "Idle"}
          />
        </div>
      </div>
    </div>
  );
}
