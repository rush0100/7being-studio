"use client";

import { useState } from "react";
import type { ConnectedDevice, DevicePublic } from "@/lib/bci-client";
import { useI18n } from "@/lib/i18n";

type Selected = {
  id: string;
  name?: string;
  kind?: string;
  nChannels?: number;
  address?: string;
  live?: boolean;
  locked?: boolean;
  battery?: number | null;
  detail?: string;
};

type Props = {
  selected: Selected | null;
  scanning: boolean;
  connecting: boolean;
  scanned: DevicePublic[];
  connected?: ConnectedDevice[];
  hints?: string[];
  codes?: string[];
  onScan: () => void;
  onSelect: (device: DevicePublic) => void;
  onDisconnect: () => void;
  onRescan: () => void;
};

function kindLabel(kind?: string) {
  if (!kind) return "Device";
  const map: Record<string, string> = {
    epocx: "EPOC X",
    h1: "H1",
    ads1299: "ADS1299",
  };
  return map[kind] || kind;
}

function streamReady(d: { kind?: string; live?: boolean; locked?: boolean }) {
  // EPOC X stays on "linking" until the session key locks. Other headsets
  // have no lock step — a live connection is the stream.
  if (d.kind === "epocx") return Boolean(d.locked);
  return Boolean(d.live);
}

function channelCount(d: { n_channels?: number; channels?: number | string[] }) {
  if (d.n_channels) return d.n_channels;
  if (typeof d.channels === "number") return d.channels;
  if (Array.isArray(d.channels)) return d.channels.length;
  return null;
}

export function DeviceScanPanel({
  selected,
  scanning,
  connecting,
  scanned,
  connected = [],
  hints = [],
  onScan,
  onSelect,
  onDisconnect,
  onRescan,
}: Props) {
  const { t } = useI18n();
  const [picking, setPicking] = useState(false);
  const live = connected.filter((d) => d.connected);
  const collapsed = !!selected && selected.live && !picking;

  if (collapsed && selected) {
    return (
      <div className="sb-scan">
        <h3 className="sb-section-title">Connected</h3>
        <article
          className={`sb-device-card selected ${selected.live ? "live" : "stale"}`}
        >
          <div className="sb-device-card-glow" aria-hidden />
          <div className="sb-device-card-top">
            <span className="sb-device-kind">{kindLabel(selected.kind)}</span>
            <span
              className={`sb-device-dot ${selected.live ? "ok" : "bad"}`}
              title={
                selected.live
                  ? streamReady(selected)
                    ? "streaming"
                    : "linking"
                  : "ยังไม่มีสตรีม — กดเริ่มสตรีม"
              }
            />
          </div>
          <h4 className="sb-device-name">{selected.name || selected.id}</h4>
          <p className="sb-device-meta">
            {selected.nChannels ? `${selected.nChannels} ch` : "—"}
            {selected.battery != null ? ` · แบต ${selected.battery}%` : ""}
            {selected.live
              ? streamReady(selected)
                ? " · streaming"
                : " · linking…"
              : " · ไม่มี data"}
          </p>
          {selected.detail ? (
            <p className="sb-device-detail">{selected.detail}</p>
          ) : null}
          <div className="sb-row">
            <button
              type="button"
              className="sb-btn"
              disabled={connecting || scanning}
              onClick={() => setPicking(true)}
            >
              เปลี่ยนเครื่อง
            </button>
            <button
              type="button"
              className="sb-btn"
              disabled={connecting}
              onClick={onDisconnect}
            >
              ตัดการเชื่อมต่อ
            </button>
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="sb-scan">
      {live.length > 0 ? (
        <div className="sb-scan-live">
          <h3 className="sb-section-title">กำลังเชื่อมต่อ</h3>
          <ul className="sb-device-list">
            {live.map((d) => {
              const isSel = selected?.id === d.id;
              const nCh = channelCount(d);
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    className={`sb-device-card pick live ${isSel ? "selected" : ""}`}
                    disabled={connecting || scanning}
                    onClick={() => {
                      onSelect(d);
                      setPicking(false);
                    }}
                  >
                    <div className="sb-device-card-top">
                      <span className="sb-device-kind">{kindLabel(d.kind)}</span>
                      <span className="sb-device-dot ok" />
                    </div>
                    <h4 className="sb-device-name">{d.name || d.id}</h4>
                    <p className="sb-device-meta">
                      {nCh != null ? `${nCh} ch` : "—"}
                      {d.battery != null ? ` · แบต ${d.battery}%` : ""}
                      {d.locked ? " · locked" : " · linked"}
                      {d.sample_rate ? ` · ${d.sample_rate} Hz` : ""}
                    </p>
                    {d.detail ? (
                      <p className="sb-device-detail">{d.detail}</p>
                    ) : null}
                    <span className="sb-device-cta">
                      {isSel ? "ใช้อยู่ในโหนดนี้" : "แตะเพื่อผูกกับโหนด"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="sb-scan-head">
        <h3 className="sb-section-title">Scan</h3>
        <button
          type="button"
          className={`sb-btn primary sb-scan-btn ${scanning ? "scanning" : ""}`}
          disabled={scanning || connecting}
          onClick={() => {
            setPicking(true);
            onScan();
          }}
        >
          {scanning ? (
            <>
              <span className="sb-scan-spinner" aria-hidden />
              กำลังสแกน…
            </>
          ) : (
            "สแกนอุปกรณ์"
          )}
        </button>
      </div>

      {scanning ? (
        <div className="sb-scan-pulse" aria-live="polite">
          <span className="sb-scan-ring" />
          <span className="sb-scan-ring delay" />
          <p>{t("scanSearching")}</p>
        </div>
      ) : null}

      {!scanning && scanned.length === 0 && live.length === 0 ? (
        <div className="sb-scan-empty">
          <p>{t("scanEmpty")}</p>
          <ul className="sb-scan-tips">
            {[t("lsl"), ...hints].map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!scanning && scanned.length === 0 && live.length > 0 ? (
        <p className="sb-scan-note">
          {t("scanConnected")}
        </p>
      ) : null}

      <ul className={`sb-device-list ${connecting ? "busy" : ""}`}>
        {scanned.map((d, i) => {
          const isSel = selected?.id === d.id;
          const nCh = channelCount(d);
          return (
            <li key={d.id} style={{ animationDelay: `${i * 40}ms` }}>
              <button
                type="button"
                className={`sb-device-card pick ${isSel ? "selected" : ""}`}
                disabled={connecting || scanning}
                onClick={() => {
                  onSelect(d);
                  setPicking(false);
                }}
              >
                <div className="sb-device-card-top">
                  <span className="sb-device-kind">{kindLabel(d.kind)}</span>
                  {isSel ? <span className="sb-device-check">✓</span> : null}
                </div>
                <h4 className="sb-device-name">{d.name || d.id}</h4>
                <p className="sb-device-meta">
                  {nCh != null ? `${nCh} ch` : "?"} ch
                  {d.address ? ` · ${d.address}` : ""}
                </p>
                <span className="sb-device-cta">
                  {connecting && isSel ? "กำลังเชื่อม…" : "แตะเพื่อเลือก"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected && picking ? (
        <button
          type="button"
          className="sb-btn ghost"
          onClick={() => setPicking(false)}
          disabled={connecting}
        >
          ยกเลิก — กลับเครื่องเดิม
        </button>
      ) : null}

      {!scanning && scanned.length > 0 ? (
        <button
          type="button"
          className="sb-btn"
          disabled={connecting}
          onClick={() => {
            setPicking(true);
            onRescan();
          }}
        >
          สแกนใหม่
        </button>
      ) : null}
    </div>
  );
}
