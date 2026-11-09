"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getMontage,
  setMontage,
  type MontageSite,
  type MontageState,
} from "@/lib/bci-client";

type Props = {
  initial?: MontageState | null;
  nChannels?: number;
  deviceKind?: string;
  disabled?: boolean;
  onToast: (msg: string) => void;
  onChanged?: (montage: MontageState) => void;
};

const FALLBACK_SITES: MontageSite[] = [
  { name: "Fp1", x: 0.35, y: 0.1 },
  { name: "Fpz", x: 0.5, y: 0.06 },
  { name: "Fp2", x: 0.65, y: 0.1 },
  { name: "AF3", x: 0.32, y: 0.18 },
  { name: "AF4", x: 0.68, y: 0.18 },
  { name: "F7", x: 0.16, y: 0.28 },
  { name: "F3", x: 0.34, y: 0.28 },
  { name: "Fz", x: 0.5, y: 0.26 },
  { name: "F4", x: 0.66, y: 0.28 },
  { name: "F8", x: 0.84, y: 0.28 },
  { name: "FC5", x: 0.22, y: 0.38 },
  { name: "FC6", x: 0.78, y: 0.38 },
  { name: "T7", x: 0.08, y: 0.5 },
  { name: "C3", x: 0.32, y: 0.5 },
  { name: "Cz", x: 0.5, y: 0.5 },
  { name: "C4", x: 0.68, y: 0.5 },
  { name: "T8", x: 0.92, y: 0.5 },
  { name: "P7", x: 0.18, y: 0.7 },
  { name: "P3", x: 0.34, y: 0.7 },
  { name: "Pz", x: 0.5, y: 0.68 },
  { name: "P4", x: 0.66, y: 0.7 },
  { name: "P8", x: 0.82, y: 0.7 },
  { name: "O1", x: 0.38, y: 0.88 },
  { name: "Oz", x: 0.5, y: 0.92 },
  { name: "O2", x: 0.62, y: 0.88 },
  { name: "CMS", x: 0.42, y: 0.58, ref: true },
  { name: "DRL", x: 0.58, y: 0.58, ref: true },
];

function assignmentsFrom(m: MontageState | null | undefined, n: number): string[] {
  const src = m?.assignments || m?.channels || [];
  return Array.from({ length: n }, (_, i) => String(src[i] || `Ch${i + 1}`));
}

export function ElectrodeMapPanel({
  initial,
  nChannels,
  deviceKind,
  disabled,
  onToast,
  onChanged,
}: Props) {
  const [montage, setLocal] = useState<MontageState | null>(initial || null);
  const [busy, setBusy] = useState(false);
  const [pickSite, setPickSite] = useState<string | null>(null);
  const [dragSite, setDragSite] = useState<string | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const channelListRef = useRef<HTMLUListElement | null>(null);
  const slotRefs = useRef<(HTMLLIElement | null)[]>([]);

  const n =
    nChannels ||
    montage?.n_channels ||
    montage?.channels?.length ||
    initial?.n_channels ||
    14;

  const sites = montage?.sites?.length ? montage.sites : FALLBACK_SITES;
  const assignments = assignmentsFrom(montage, n);
  const reference = montage?.reference || "CMS";
  const refs = montage?.ref_candidates?.length
    ? montage.ref_candidates
    : ["CMS", "DRL", "Cz"];
  const used = useMemo(() => new Set(assignments), [assignments]);

  useEffect(() => {
    let alive = true;
    getMontage()
      .then((m) => {
        if (alive) setLocal(m);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [nChannels, deviceKind]);

  useEffect(() => {
    if (initial) setLocal(initial);
  }, [initial]);

  const closed = montage?.closed || [];

  const persist = async (next: string[], ref: string, closedIdx: number[] = closed) => {
    setBusy(true);
    try {
      const m = await setMontage({
        action: "set",
        assignments: next,
        reference: ref,
        closed: closedIdx,
      });
      setLocal(m);
      onChanged?.(m);
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const assign = (channelIndex: number, site: string) => {
    const next = [...assignments];
    const prev = next.findIndex((s, i) => i !== channelIndex && s === site);
    if (prev >= 0) next[prev] = `Ch${prev + 1}`;
    next[channelIndex] = site;
    setPickSite(null);
    void persist(next, reference);
    requestAnimationFrame(() => {
      slotRefs.current[channelIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  };

  const clearSlot = (channelIndex: number) => {
    const next = [...assignments];
    next[channelIndex] = `Ch${channelIndex + 1}`;
    void persist(next, reference);
  };

  const toggleClosed = (channelIndex: number) => {
    const off = new Set(closed);
    if (off.has(channelIndex)) off.delete(channelIndex);
    else {
      if (assignments.length - off.size <= 1) {
        onToast("ต้องเปิดอย่างน้อย 1 แชนแนล");
        return;
      }
      off.add(channelIndex);
    }
    void persist(assignments, reference, [...off].sort((a, b) => a - b));
  };

  const onReset = async () => {
    setBusy(true);
    try {
      const m = await setMontage({ action: "reset" });
      setLocal(m);
      onChanged?.(m);
      onToast("คืนค่าเริ่มต้นแล้ว");
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sb-emap">
      <div className="sb-emap-head">
        <h3 className="sb-section-title">แผนที่อิเล็กโทด</h3>
        <div className="sb-emap-actions">
          <button
            type="button"
            className="sb-btn"
            disabled={disabled || busy}
            onClick={onReset}
          >
            ค่าเริ่มต้น
          </button>
        </div>
      </div>
      <p className="sb-emap-hint">
        ลากจุดบนศีรษะไปวางที่แชนแนล — กด ปิด ถ้าไม่ได้ใช้อิเล็กโทรดนั้น
      </p>

      <div className="sb-emap-grid">
        <div className="sb-emap-headmap" aria-label="พิกัดบนศีรษะ">
          <div className="sb-emap-stage">
            <svg viewBox="0 0 100 100" className="sb-emap-svg" aria-hidden>
              <ellipse cx="50" cy="52" rx="38" ry="42" className="sb-emap-skull" />
              <path d="M38 14 Q50 4 62 14" className="sb-emap-nose" fill="none" />
              <text x="50" y="9" textAnchor="middle" className="sb-emap-nose-label">
                จมูก
              </text>
            </svg>
            {sites.map((s) => {
              const assigned = used.has(s.name);
              const active = pickSite === s.name || dragSite === s.name;
              const isRef = Boolean(s.ref);
              return (
                <button
                  key={s.name}
                  type="button"
                  className={`sb-emap-pin ${assigned ? "used" : ""} ${active ? "active" : ""} ${isRef ? "is-ref" : ""}`}
                  style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }}
                  title={isRef ? `Reference ${s.name}` : s.name}
                  disabled={disabled || busy}
                  draggable={!disabled && !busy && !isRef}
                  onDragStart={(e) => {
                    setDragSite(s.name);
                    e.dataTransfer.setData("text/site", s.name);
                    e.dataTransfer.effectAllowed = "copyMove";
                  }}
                  onDragEnd={() => {
                    setDragSite(null);
                    setDropIdx(null);
                  }}
                  onClick={() => {
                    if (isRef) {
                      void persist(assignments, s.name);
                      return;
                    }
                    setPickSite((cur) => (cur === s.name ? null : s.name));
                  }}
                >
                  <span className="sb-emap-pin-dot" />
                  <span className="sb-emap-pin-label">{s.name}</span>
                </button>
              );
            })}
          </div>
          {pickSite ? (
            <p className="sb-emap-pick">
              เลือกแล้ว <strong>{pickSite}</strong> — แตะแชนแนลด้านขวา
            </p>
          ) : (
            <p className="sb-emap-pick muted">ลากหรือแตะตำแหน่งบนศีรษะ</p>
          )}
        </div>

        <div className="sb-emap-channels">
          <label className="sb-emap-ref">
            <span>Reference</span>
            <select
              value={reference}
              disabled={disabled || busy}
              onChange={(e) => void persist(assignments, e.target.value)}
            >
              {refs.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <ul className="sb-emap-slots" ref={channelListRef}>
            {assignments.map((site, i) => {
              const isDefault = site === `Ch${i + 1}`;
              const isClosed = closed.includes(i);
              return (
                <li
                  key={i}
                  ref={(el) => {
                    slotRefs.current[i] = el;
                  }}
                  className={`sb-emap-slot ${dropIdx === i ? "drop" : ""} ${pickSite ? "await" : ""} ${isClosed ? "is-closed" : ""}`}
                  style={{ animationDelay: `${i * 28}ms` }}
                  onClick={() => {
                    if (disabled || busy) return;
                    if (pickSite) assign(i, pickSite);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropIdx(i);
                  }}
                  onDragLeave={() => setDropIdx((cur) => (cur === i ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const name =
                      e.dataTransfer.getData("text/site") || dragSite || "";
                    setDropIdx(null);
                    setDragSite(null);
                    if (name) assign(i, name);
                  }}
                >
                  <span className="sb-emap-ch">Ch{i + 1}</span>
                  <span className={`sb-emap-site-tag ${isDefault ? "orphan" : ""}`}>
                    {site}
                  </span>
                  <button
                    type="button"
                    className="sb-emap-clear"
                    disabled={disabled || busy}
                    aria-label={isClosed ? `เปิดแชนแนล ${site}` : `ปิดแชนแนล ${site}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleClosed(i);
                    }}
                  >
                    {isClosed ? "เปิด" : "ปิด"}
                  </button>
                  <button
                    type="button"
                    className="sb-emap-clear"
                    disabled={disabled || busy || isDefault}
                    aria-label={`ล้างแชนแนล ${i + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      clearSlot(i);
                    }}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
