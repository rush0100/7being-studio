"use client";

import { useEffect, useRef, useState } from "react";
import {
  AFFECT_NAMES,
  BAND_NAMES,
  DEFAULT_CH,
  FACE_NAMES,
  normalizeBands,
} from "@/lib/live-labels";
import { setMontage } from "@/lib/bci-client";
import { siteThFor } from "@/lib/cortex-map";
import { CortexView, type BrainPayload } from "@/components/panels/CortexView";
import { ImuBrainDial } from "@/components/panels/ImuBrainDial";

export type MotionPayload = {
  quat: number[];
  accel: number[];
  mag: number[];
  gyro?: number[];
  /** Server ZYX euler (deg), already wrapped ±180. */
  euler?: { yaw: number; pitch: number; roll: number };
  /** Headset parked — attitude hard-frozen. */
  still?: boolean;
  values?: number[];
  axes?: string[];
} | null;

export type LiveSnapshot = {
  samples: number[][];
  cq: (number | null)[];
  affect: (number | null)[];
  face: (number | null)[];
  bands: number[] | null;
  /** 14×[θ,α,β,γ] */
  channelBands: number[][] | null;
  battery: number | null;
  signal: number | null;
  pktS: number;
  sampleS: number;
  channelLabels: string[];
  /** Channel indexes hidden from the live view. */
  closed?: number[];
  brain: BrainPayload;
  /** Fused quat + accel (g) + mag (µT). */
  motion: MotionPayload;
};

type Props = {
  live: LiveSnapshot;
  command: string;
  keyName: string;
  confidence: number;
};

function meterUnit(raw: unknown): number | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const nums = raw.map(Number).filter((n) => Number.isFinite(n));
    if (!nums.length) return null;
    return Math.max(0, Math.min(1, nums.reduce((a, b) => a + b, 0) / nums.length));
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function fmt3(v: number | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function vecMag(v: number[]): number {
  const x = Number(v[0]) || 0;
  const y = Number(v[1]) || 0;
  const z = Number(v[2]) || 0;
  return Math.sqrt(x * x + y * y + z * z);
}

type Ypr = { yaw: number; pitch: number; roll: number };

function wrap180(deg: number): number {
  return ((deg + 180) % 360 + 360) % 360 - 180;
}

/** Pitch/roll from gravity only. Yaw is undefined → 0. */
function accelToYpr(a: number[]): Ypr {
  const ax = Number(a[0]) || 0;
  const ay = Number(a[1]) || 0;
  const az = Number(a[2]) || 0;
  const roll = (Math.atan2(ay, az) * 180) / Math.PI;
  const pitch =
    (Math.atan2(-ax, Math.sqrt(ay * ay + az * az)) * 180) / Math.PI;
  return {
    yaw: 0,
    pitch: Math.max(-90, Math.min(90, pitch)),
    roll: wrap180(roll),
  };
}

function useSmoothYpr(target: Ypr, alpha = 0.2): Ypr {
  const [smooth, setSmooth] = useState(target);
  const primed = useRef(false);

  useEffect(() => {
    if (!primed.current) {
      primed.current = true;
      setSmooth(target);
      return;
    }
    setSmooth((prev) => {
      const next = {
        yaw: 0,
        pitch: prev.pitch + (target.pitch - prev.pitch) * alpha,
        roll:
          prev.roll +
          ((((target.roll - prev.roll + 540) % 360) - 180) * alpha),
      };
      if (
        Math.abs(next.pitch - prev.pitch) < 0.5 &&
        Math.abs(wrap180(next.roll - prev.roll)) < 0.5
      ) {
        return prev;
      }
      return next;
    });
  }, [target.pitch, target.roll, alpha]);

  return smooth;
}

function AxisMini({
  values,
  range,
  digits = 2,
}: {
  values: number[];
  range: number;
  digits?: number;
}) {
  const tones = ["x", "y", "z"] as const;
  return (
    <div className="sb-imu-mini">
      {tones.map((tone, i) => {
        const raw = Number(values[i]);
        const v = Number.isFinite(raw) ? raw : 0;
        const pct = Math.max(-1, Math.min(1, v / range));
        const fill = Math.abs(pct) * 50;
        const positive = pct >= 0;
        return (
          <div key={tone} className="sb-imu-mini-row">
            <span className={`sb-imu-axis-lab ${tone}`}>{tone.toUpperCase()}</span>
            <div className="sb-imu-axis-track">
              <div className="sb-imu-axis-mid" />
              <div
                className={`sb-imu-axis-fill ${tone} ${positive ? "pos" : "neg"}`}
                style={
                  positive
                    ? { left: "50%", width: `${fill}%` }
                    : { right: "50%", width: `${fill}%` }
                }
              />
            </div>
            <span className="sb-imu-mini-val">{fmt3(v, digits)}</span>
          </div>
        );
      })}
    </div>
  );
}

function MotionReadout({
  motion,
  hasImu,
}: {
  motion: MotionPayload;
  hasImu: boolean;
}) {
  const q = motion?.quat || [1, 0, 0, 0];
  const a = motion?.accel || [0, 0, 0];
  const m = motion?.mag || [0, 0, 0];
  const { pitch, roll } = useSmoothYpr(accelToYpr(a), 0.22);

  if (!motion) {
    return (
      <div className="sb-imu sb-imu--idle" aria-label="Headset motion">
        <div className="sb-imu-idle-orb" />
        <p className="sb-motion-empty">
          {hasImu ? "รอ MEMS · ICM-20948" : "ไม่มี IMU"}
        </p>
        <span className="sb-imu-idle-hint">
          {hasImu ? "quat · accel · gyro · mag" : "อุปกรณ์นี้ไม่มีเซ็นเซอร์การเคลื่อนไหว"}
        </span>
      </div>
    );
  }
  const g = motion.gyro || [0, 0, 0];
  const aMag = vecMag(a);
  const gMag = vecMag(g);
  const mMag = vecMag(m);

  return (
    <div className="sb-imu" aria-label="Headset motion">
      <div className="sb-imu-hero">
        <div className="sb-imu-attitude" aria-hidden>
          <div className="sb-imu-compass">
            <ImuBrainDial pitch={pitch} roll={roll} />
          </div>
        </div>
        <div className="sb-imu-hero-meta">
          <div className="sb-imu-tilt">
            <div>
              <span>Pitch</span>
              <strong>{fmt3(pitch, 1)}°</strong>
            </div>
            <div>
              <span>Roll</span>
              <strong>{fmt3(roll, 1)}°</strong>
            </div>
          </div>
          <div className="sb-imu-quat-row" title="Quaternion wxyz">
            {(["Q0", "Q1", "Q2", "Q3"] as const).map((lab, i) => (
              <div key={lab}>
                <span>{lab}</span>
                <code>{fmt3(q[i], 3)}</code>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="sb-imu-board">
        <div className="sb-imu-col">
          <header>
            <h4>Accel</h4>
            <span>{fmt3(aMag)} g</span>
          </header>
          <AxisMini values={a} range={2} digits={2} />
        </div>
        <div className="sb-imu-col">
          <header>
            <h4>Gyro</h4>
            <span>{fmt3(gMag, 1)} °/s</span>
          </header>
          <AxisMini values={g} range={250} digits={1} />
        </div>
        <div className="sb-imu-col">
          <header>
            <h4>Mag</h4>
            <span>{fmt3(mMag, 0)} µT</span>
          </header>
          <AxisMini values={m} range={80} digits={1} />
        </div>
      </div>
    </div>
  );
}

function MeterRow({
  names,
  values,
  tone = "blue",
  emptyLabel = "—",
}: {
  names: readonly string[];
  values: unknown[];
  tone?: "blue" | "teal" | "copper";
  emptyLabel?: string;
}) {
  return (
    <div className="sb-meters">
      {names.map((name, i) => {
        const v = meterUnit(values[i]);
        return (
          <div key={name} className="sb-meter">
            <span className="sb-meter-name">{name}</span>
            <div className="sb-meter-track">
              <div
                className={`sb-meter-fill ${tone}`}
                style={{ width: v == null ? "0%" : `${v * 100}%` }}
              />
            </div>
            <span className="sb-meter-val">
              {v == null ? emptyLabel : v.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CqDots({
  labels,
  values,
}: {
  labels: string[];
  values: (number | null)[];
}) {
  return (
    <div className="sb-cq-dots">
      {labels.map((name, i) => {
        const raw = values[i];
        const v =
          raw == null || Number.isNaN(raw)
            ? null
            : Math.max(0, Math.min(1, Number(raw)));
        const tone =
          v == null ? "null" : v >= 0.7 ? "good" : v >= 0.4 ? "mid" : "bad";
        const site = siteThFor(name);
        return (
          <div
            key={name}
            className="sb-cq-dot"
            title={`${name}${site ? ` · ${site}` : ""}: ${v ?? "—"}`}
          >
            <span className={`sb-cq-pip ${tone}`} />
            <span className="sb-cq-label">{name}</span>
          </div>
        );
      })}
    </div>
  );
}

function openIndexes(count: number, closed: number[]): number[] {
  const off = new Set(closed);
  const open = Array.from({ length: count }, (_, i) => i).filter((i) => !off.has(i));
  return open.length ? open : Array.from({ length: count }, (_, i) => i);
}

function ChannelToggles({
  labels,
  closed,
}: {
  labels: string[];
  closed: number[];
}) {
  const off = new Set(closed);
  const openCount = labels.filter((_, i) => !off.has(i)).length;
  const toggle = (index: number, close: boolean) => {
    if (close && openCount <= 1) return;
    const next = new Set(closed);
    if (close) next.add(index);
    else next.delete(index);
    void setMontage({ closed: [...next].sort((a, b) => a - b) }).catch(() => undefined);
  };
  return (
    <div className="sb-ch-toggles" aria-label="เปิดปิดแชนแนล">
      {labels.map((name, i) => {
        const isOff = off.has(i);
        const lastOpen = !isOff && openCount <= 1;
        return (
          <button
            key={`${name}-${i}`}
            type="button"
            className={`sb-ch-toggle${isOff ? " is-off" : ""}`}
            disabled={lastOpen}
            title={
              lastOpen ? "ต้องเปิดอย่างน้อย 1 แชนแนล" : isOff ? `เปิด ${name}` : `ปิด ${name}`
            }
            onClick={() => toggle(i, !isOff)}
          >
            {name}
            <span aria-hidden>{isOff ? "+" : "×"}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Samples are microvolts. Keep the lane label in µV even when the number is large. */
function formatUv(v: number): string {
  const a = Math.abs(v);
  if (!Number.isFinite(a)) return "—";
  if (a >= 1000) {
    const rounded = Math.round(a).toString();
    return `${rounded.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} µV`;
  }
  if (a >= 10) return `${a.toFixed(0)} µV`;
  return `${a.toFixed(1)} µV`;
}

function EegCanvas({
  samples,
  labels,
  indices,
}: {
  samples: number[][];
  labels: string[];
  indices: number[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const samplesRef = useRef(samples);
  const labelsRef = useRef(labels);
  const indicesRef = useRef(indices);
  samplesRef.current = samples;
  labelsRef.current = labels;
  indicesRef.current = indices;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0;
    let dead = false;
    let lastSig = "";

    const draw = () => {
      if (dead) return;
      raf = requestAnimationFrame(draw);
      const rows = samplesRef.current;
      const chLabels = labelsRef.current;
      const cols = indicesRef.current;
      const sig = `${rows.length}:${rows[rows.length - 1]?.[cols[0] ?? 0] ?? ""}:${cols.join(",")}`;
      if (sig === lastSig) return;
      lastSig = sig;

      const parent = canvas.parentElement;
      const w = parent?.clientWidth || 640;
      const h = Math.max(180, Math.min(320, parent?.clientHeight || 220));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.floor(w * dpr);
      const ph = Math.floor(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "rgba(12, 28, 44, 0.9)");
      grad.addColorStop(1, "rgba(8, 14, 24, 0.95)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const nCh = Math.max(cols.length, 1);
      // ~0.75–1s window keeps motion feeling live.
      const view = rows.slice(-Math.min(rows.length, 96));
      if (!view.length) {
        ctx.fillStyle = "rgba(174, 183, 199, 0.85)";
        ctx.font = "12px IBM Plex Mono, monospace";
        ctx.fillText("รอสตรีม EEG — กดเริ่มสตรีม", 14, 24);
        return;
      }

      const lane = h / nCh;
      const labelW = Math.min(168, Math.max(92, w * 0.22));
      const scaleW = 78;
      for (let laneI = 0; laneI < cols.length; laneI++) {
        const ch = cols[laneI];
        const y0 = lane * laneI + lane * 0.5;
        ctx.strokeStyle = "rgba(247,248,245,0.05)";
        ctx.beginPath();
        ctx.moveTo(0, y0);
        ctx.lineTo(w, y0);
        ctx.stroke();

        const name = chLabels[ch] || `Ch${ch + 1}`;
        const site = siteThFor(name);
        ctx.fillStyle = "rgba(174, 183, 199, 0.9)";
        ctx.font = "9px IBM Plex Mono, monospace";
        ctx.fillText(name, 6, y0 - lane * 0.18);
        if (site && lane >= 11) {
          ctx.fillStyle = "rgba(174, 183, 199, 0.55)";
          ctx.font = "8px IBM Plex Sans Thai, sans-serif";
          ctx.fillText(site, 6, y0 + lane * 0.28);
        }

        const series = view.map((r) => Number(r[ch] ?? 0));
        let min = Infinity;
        let max = -Infinity;
        for (const v of series) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
        // Soften autoscale so the trace doesn't "breathe" every frame.
        const mid = (min + max) * 0.5;
        const half = Math.max((max - min) * 0.55, 8);
        const amp = lane * 0.38;
        const scale = Number.isFinite(max - min) ? formatUv((max - min) / 2) : "";

        ctx.fillStyle = "rgba(174, 183, 199, 0.7)";
        ctx.font = "9px IBM Plex Mono, monospace";
        ctx.textAlign = "right";
        ctx.fillText(`±${scale}`, w - 6, y0 - lane * 0.18);
        ctx.textAlign = "left";

        ctx.strokeStyle = laneI % 2 === 0 ? "#5b8dff" : "#22c9a8";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        series.forEach((v, i) => {
          const x =
            labelW +
            (i / Math.max(series.length - 1, 1)) * (w - labelW - scaleW);
          const y = y0 - ((v - mid) / half) * amp;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={ref} className="sb-eeg-canvas" />;
}

/** Live — brain hero + signal rail. */
export function LiveMonitor({ live, command, keyName, confidence }: Props) {
  const labels =
    live.channelLabels.length > 0 ? live.channelLabels : [...DEFAULT_CH];
  const closed = live.closed || [];
  const openIdx = openIndexes(labels.length, closed);
  const openLabels = openIdx.map((i) => labels[i]);
  const openBands = live.channelBands
    ? openIdx.map((i) => live.channelBands?.[i] || [0, 0, 0, 0])
    : live.channelBands;
  const openCq = openIdx.map((i) => live.cq[i] ?? null);
  const confPct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  const streaming = live.samples.length > 0 || live.pktS > 0;

  return (
    <div className="sb-live">
      <section className="sb-live-stage" aria-label="สมอง">
        <CortexView
          brain={live.brain}
          bands={live.bands}
          channelBands={openBands}
          cq={openCq}
          battery={live.battery}
          streaming={streaming}
          channelLabels={openLabels}
        />
        <div className="sb-live-cmd">
          <p className="sb-live-cmd-kicker">Mental state</p>
          <div className="sb-live-cmd-row">
            <h2 className="sb-live-cmd-name">{command || "Neutral"}</h2>
            <span className="sb-live-cmd-key">{keyName || "·"}</span>
          </div>
          <div className="sb-live-cmd-meta">
            <span>{confPct}%</span>
            <span>{live.pktS.toFixed(1)} pkt/s</span>
            <span>{live.sampleS.toFixed(1)} Hz</span>
            {live.signal != null ? <span>sig {live.signal}</span> : null}
            <span className={streaming ? "is-live" : ""}>
              {streaming ? "streaming" : "idle"}
            </span>
          </div>
        </div>
      </section>

      <aside className="sb-live-rail" aria-label="Signals">
        <div className="sb-live-rail-block">
          <div className="sb-live-rail-head">
            <h3>EEG</h3>
            <span>
              {openLabels.length} ch · µV
              {closed.length ? ` · ปิด ${closed.length}` : ""}
            </span>
          </div>
          <ChannelToggles labels={labels} closed={closed} />
          <div className="sb-eeg-wrap">
            <EegCanvas samples={live.samples} labels={labels} indices={openIdx} />
          </div>
        </div>

        <div className="sb-live-rail-block">
          <div className="sb-live-rail-head">
            <h3>Contact</h3>
          </div>
          <CqDots labels={openLabels} values={openCq} />
        </div>

        <div className="sb-live-rail-block">
          <div className="sb-live-rail-head">
            <h3>Affect</h3>
          </div>
          <MeterRow names={AFFECT_NAMES} values={live.affect} tone="blue" />
        </div>

        <div className="sb-live-rail-split">
          <div className="sb-live-rail-block">
            <div className="sb-live-rail-head">
              <h3>Face</h3>
            </div>
            <MeterRow
              names={FACE_NAMES}
              values={live.face}
              tone="copper"
              emptyLabel="ไม่มี"
            />
          </div>
          <div className="sb-live-rail-block">
            <div className="sb-live-rail-head">
              <h3>Bands</h3>
            </div>
            <MeterRow
              names={BAND_NAMES}
              values={normalizeBands(live.bands) || []}
              tone="teal"
            />
          </div>
        </div>

        <div className="sb-live-rail-block">
          <div className="sb-live-rail-head">
            <h3>Motion</h3>
            <span>{labels.length >= 14 ? "quat · accel · gyro · mag" : "ไม่มี IMU"}</span>
          </div>
          <MotionReadout motion={live.motion} hasImu={labels.length >= 14} />
        </div>
      </aside>
    </div>
  );
}
