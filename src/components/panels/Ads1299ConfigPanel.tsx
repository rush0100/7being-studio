"use client";

import type { Ads1299FrontEnd } from "@/lib/bci-client";

const GAINS = [1, 2, 4, 6, 8, 12, 24];

type Props = {
  value: Ads1299FrontEnd;
  live: boolean;
  busy: boolean;
  onChange: (next: Ads1299FrontEnd) => void;
  onApply: () => void;
};

function wiring(value: Ads1299FrontEnd): string[] {
  const pins = value.channels.map((n) => `อิเล็กโทรด CH${n} → IN${n}P (+)`);
  if (value.reference === "shared") {
    pins.push("อิเล็กโทรดอ้างอิง → SRB1");
    pins.push("ขา INxN (−) ไม่ต้องผูกเอง — ชิปต่อเข้า SRB1");
  } else {
    pins.push("แต่ละช่องใช้ขา + และ − ของตัวเอง");
    pins.push("ไม่เปิด SRB1");
  }
  if (value.bias) pins.push("อิเล็กโทรดไบแอส → BIAS");
  return pins;
}

export function Ads1299ConfigPanel({ value, live, busy, onChange, onApply }: Props) {
  const toggle = (n: number) => {
    const has = value.channels.includes(n);
    const channels = has
      ? value.channels.filter((c) => c !== n)
      : [...value.channels, n].sort((a, b) => a - b);
    if (!channels.length) return;
    onChange({ ...value, channels });
  };

  return (
    <section className="sb-ads-config">
      <h3 className="sb-section-title">ADS1299 input</h3>
      <p className="sb-muted">
        เลือกช่องที่ต่ออิเล็กโทรด ช่องที่ไม่ได้เลือกจะถูกปิดไฟบนชิป
      </p>
      <div className="sb-ch-grid" role="group" aria-label="ช่องที่เปิด">
        {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => {
          const on = value.channels.includes(n);
          return (
            <button
              key={n}
              type="button"
              className={`sb-ch ${on ? "on" : ""}`}
              aria-pressed={on}
              disabled={busy}
              onClick={() => toggle(n)}
            >
              CH{n}
            </button>
          );
        })}
      </div>

      <label className="sb-field">
        อ้างอิง
        <select
          value={value.reference}
          disabled={busy}
          onChange={(e) =>
            onChange({
              ...value,
              reference: e.target.value === "differential" ? "differential" : "shared",
            })
          }
        >
          <option value="shared">อ้างอิงร่วม (SRB1)</option>
          <option value="differential">แยก + / − รายช่อง</option>
        </select>
      </label>

      <label className="sb-check">
        <input
          type="checkbox"
          checked={value.bias}
          disabled={busy}
          onChange={(e) => onChange({ ...value, bias: e.target.checked })}
        />
        เปิดไบแอส (ขา BIAS)
      </label>

      <label className="sb-field">
        Gain
        <select
          value={value.gain}
          disabled={busy}
          onChange={(e) => onChange({ ...value, gain: Number(e.target.value) })}
        >
          {GAINS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>

      <ol className="sb-wire">
        {wiring(value).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>

      <button type="button" className="sb-btn primary" disabled={busy} onClick={onApply}>
        {live ? "ใช้การตั้งค่า" : "จำไว้ แล้วใช้ตอนเชื่อมต่อ"}
      </button>
    </section>
  );
}
