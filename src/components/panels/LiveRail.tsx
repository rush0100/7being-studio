"use client";

type Props = {
  apiOk: boolean | null;
  status: string;
  command: string;
  keyName: string;
  confidence: number;
  source: string;
  connected: boolean;
  onConnect: () => void;
  onStop: () => void;
};

/** Compact live status strip (replaces left sidebar). */
export function LiveRail({
  apiOk,
  status,
  command,
  keyName,
  confidence,
  source,
  connected,
  onConnect,
  onStop,
}: Props) {
  return (
    <div className="sb-status" role="status">
      <span className="sb-status-pill">
        <span
          className={`sb-dot ${apiOk ? "ok" : apiOk === false ? "bad" : ""}`}
        />
        API {apiOk === null ? "…" : apiOk ? "พร้อม" : "ออฟไลน์"}
      </span>
      <span className="sb-status-pill">
        <span className="sb-status-cmd">{command || "Neutral"}</span>
        <span className="sb-status-key">{keyName || "·"}</span>
        <span>{(confidence * 100).toFixed(0)}%</span>
      </span>
      {source ? (
        <span className="sb-status-pill">
          <strong>{source}</strong>
        </span>
      ) : null}
      <span className="sb-status-grow" title={status}>
        {status || "—"}
      </span>
      {!connected ? (
        <button
          type="button"
          className="sb-btn primary sb-status-cta"
          onClick={onConnect}
        >
          <span className="sb-status-cta-full">เริ่มสตรีม</span>
          <span className="sb-status-cta-short">สตรีม</span>
        </button>
      ) : (
        <button type="button" className="sb-btn sb-status-cta" onClick={onStop}>
          หยุด
        </button>
      )}
    </div>
  );
}
