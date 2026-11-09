"use client";

import type { Node } from "@xyflow/react";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  attachPlugin,
  configureDevice,
  connectDevice,
  createProfile,
  deleteProfile,
  disconnectDevice,
  fitTrain,
  getDevices,
  getPlugins,
  installPlugin,
  reloadPlugins,
  selectProfile,
  setKeysEnabled,
  setMentalLive,
  startCalibrate,
  startTrain,
  stopCalibrate,
  stopTrain,
  updateControl,
  DEFAULT_ADS1299_FRONTEND,
  type Ads1299FrontEnd,
  type AppState,
  type DevicePublic,
  type PluginInfo,
} from "@/lib/bci-client";
import type {
  DeviceNodeData,
  MentalNodeData,
  OutputNodeData,
} from "@/lib/flow-schema";
import { Ads1299ConfigPanel } from "@/components/panels/Ads1299ConfigPanel";
import { DeviceScanPanel } from "@/components/panels/DeviceScanPanel";
import { ElectrodeMapPanel } from "@/components/panels/ElectrodeMapPanel";
import { TrainCue } from "@/components/panels/TrainCue";

type Props = {
  node: Node | null;
  app: AppState | null;
  open: boolean;
  onClose: () => void;
  onChangeNode: (id: string, data: Record<string, unknown>) => void;
  onRefreshApp: () => Promise<void>;
  onToast: (msg: string) => void;
};

export function Inspector({
  node,
  app,
  open,
  onClose,
  onChangeNode,
  onRefreshApp,
  onToast,
}: Props) {
  if (!open || !node) return null;

  const title =
    node.type === "device"
      ? "Device"
      : node.type === "mental"
        ? "Mental"
        : node.type === "output"
          ? String((node.data as { label?: string }).label || "Output")
          : "Inspector";

  return (
    <>
      <button
        type="button"
        className="sb-drawer-backdrop"
        aria-label="ปิดแผงตั้งค่า"
        onClick={onClose}
      />
      <aside className="sb-drawer" role="dialog" aria-label={title}>
        <span className="sb-drawer-handle" aria-hidden />
        <div className="sb-drawer-head">
          <h2>{title}</h2>
          <button type="button" className="sb-btn icon ghost" onClick={onClose} aria-label="ปิด">
            ×
          </button>
        </div>
        <div className="sb-drawer-body">
          {node.type === "device" ? (
            <DeviceInspector
              node={node}
              app={app}
              onChangeNode={onChangeNode}
              onRefreshApp={onRefreshApp}
              onToast={onToast}
            />
          ) : null}
          {node.type === "mental" ? (
            <MentalInspector
              node={node}
              app={app}
              onChangeNode={onChangeNode}
              onRefreshApp={onRefreshApp}
              onToast={onToast}
            />
          ) : null}
          {node.type === "output" ? (
            <OutputInspector
              node={node}
              onChangeNode={onChangeNode}
              onToast={onToast}
            />
          ) : null}
        </div>
      </aside>
    </>
  );
}

function DeviceInspector({
  node,
  app,
  onChangeNode,
  onRefreshApp,
  onToast,
}: {
  node: Node;
  app: AppState | null;
  onChangeNode: Props["onChangeNode"];
  onRefreshApp: Props["onRefreshApp"];
  onToast: Props["onToast"];
}) {
  const { t } = useI18n();
  const data = node.data as DeviceNodeData;
  const [scanned, setScanned] = useState<DevicePublic[]>([]);
  const [scanHint, setScanHint] = useState<string[]>([]);
  const [scanCodes, setScanCodes] = useState<string[]>([]);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [pluginsOpen, setPluginsOpen] = useState(!data.deviceId);
  const [frontEnd, setFrontEnd] = useState<Ads1299FrontEnd>(DEFAULT_ADS1299_FRONTEND);

  const refreshPlugins = async () => {
    const state = await getPlugins();
    setPlugins(state.plugins || []);
  };

  useEffect(() => {
    refreshPlugins().catch(() => setPlugins([]));
  }, []);

  useEffect(() => {
    if (data.deviceId) setPluginsOpen(false);
  }, [data.deviceId]);

  // API may already be streaming (auto-connect) while the canvas node has no deviceId.
  useEffect(() => {
    const live = (app?.devices?.connected || []).filter((d) => d.connected);
    if (!live.length) return;
    const primaryId =
      app?.devices?.primary_id || app?.devices?.primary || live[0]?.id;
    const match =
      (data.deviceId && live.find((d) => d.id === data.deviceId)) ||
      live.find((d) => d.id === primaryId) ||
      live[0];
    if (!match) return;
    if (
      data.deviceId === match.id &&
      data.deviceName === (match.name || match.id) &&
      data.deviceKind === match.kind
    ) {
      return;
    }
    const nCh =
      match.n_channels ||
      (Array.isArray(match.channels) ? match.channels.length : undefined);
    onChangeNode(node.id, {
      ...data,
      deviceId: match.id,
      deviceName: match.name || match.id,
      deviceKind: match.kind,
      nChannels: nCh ?? data.nChannels,
    });
    setPluginsOpen(false);
  }, [app?.devices?.connected, app?.devices?.primary_id, app?.devices?.primary]); // eslint-disable-line react-hooks/exhaustive-deps

  const scan = async () => {
    setScanning(true);
    setBusy(true);
    try {
      const state = await getDevices();
      const list = state.scanned || [];
      setScanned(list);
      const tips = state.hint?.tips || [];
      setScanHint(tips);
      setScanCodes(state.hint?.codes || []);
      if (list.length > 0) {
        onToast(t("found").replace("{n}", String(list.length)));
      } else {
        onToast(t("noneFound"));
      }
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
      setBusy(false);
    }
  };

  const connect = async (device: DevicePublic) => {
    setBusy(true);
    try {
      await connectDevice(device.id, device.kind === "ads1299" ? frontEnd : undefined);
      const nCh =
        device.n_channels ||
        (typeof device.channels === "number"
          ? device.channels
          : Array.isArray(device.channels)
            ? device.channels.length
            : undefined);
      onChangeNode(node.id, {
        ...data,
        deviceId: device.id,
        deviceName: device.name || device.id,
        deviceKind: device.kind,
        nChannels: nCh,
      });
      setPluginsOpen(false);
      await onRefreshApp();
      onToast(`เลือก ${device.name || device.id}`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await disconnectDevice(data.deviceId);
      onChangeNode(node.id, {
        ...data,
        deviceId: undefined,
        deviceName: undefined,
        deviceKind: undefined,
        nChannels: undefined,
      });
      setPluginsOpen(true);
      await onRefreshApp();
      onToast("ตัดการเชื่อมต่อแล้ว");
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onInstall = async (id: string) => {
    setBusy(true);
    try {
      const result = await installPlugin(id);
      setPlugins(result.plugins || []);
      await onRefreshApp();
      if (result.ok === false) {
        onToast(result.stderr || result.error || "install failed");
      } else {
        onToast(`installed ${id} — รัน ${result.serve || "serve"} แล้ว Attach`);
      }
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onAttach = async (id: string, endpoint: string) => {
    setBusy(true);
    try {
      const result = await attachPlugin(id, endpoint);
      setPlugins(result.plugins || []);
      await onRefreshApp();
      onToast(`attached ${result.endpoint || endpoint}`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onReload = async () => {
    setBusy(true);
    try {
      const result = await reloadPlugins();
      setPlugins(result.plugins || []);
      await onRefreshApp();
      onToast("plugins reloaded");
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const applyFrontEnd = async (id: string | undefined, live: boolean) => {
    if (!id || !live) {
      onToast("จำการต่อ CH ไว้แล้ว — จะเขียนลงบอร์ดตอนเชื่อมต่อ");
      return;
    }
    setBusy(true);
    try {
      const result = await configureDevice(id, frontEnd);
      onToast(result.detail || "ตั้งค่า ADS1299 แล้ว");
      await onRefreshApp();
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const connectedLive = (app?.devices?.connected || []).filter((d) => d.connected);
  const liveInfo =
    connectedLive.find((d) => d.id === data.deviceId) || connectedLive[0];
  const selected = data.deviceId
    ? {
        id: data.deviceId,
        name: data.deviceName || liveInfo?.name,
        kind: data.deviceKind || liveInfo?.kind,
        nChannels:
          data.nChannels ||
          liveInfo?.n_channels ||
          (Array.isArray(liveInfo?.channels) ? liveInfo.channels.length : undefined),
        address: liveInfo?.address,
        live: Boolean(liveInfo?.connected && liveInfo.id === data.deviceId),
        locked: Boolean(liveInfo?.locked && liveInfo.id === data.deviceId),
        battery: liveInfo?.id === data.deviceId ? liveInfo?.battery : null,
        detail: liveInfo?.id === data.deviceId ? liveInfo?.detail : undefined,
      }
    : liveInfo
      ? {
          id: liveInfo.id,
          name: liveInfo.name,
          kind: liveInfo.kind,
          nChannels:
            liveInfo.n_channels ||
            (Array.isArray(liveInfo.channels) ? liveInfo.channels.length : undefined),
          address: liveInfo.address,
          live: true,
          locked: Boolean(liveInfo.locked),
          battery: liveInfo.battery,
          detail: liveInfo.detail,
        }
      : null;

  const showAds =
    (!selected?.kind || selected.kind === "ads1299") &&
    (selected?.kind === "ads1299" ||
      scanned.some((d) => d.kind === "ads1299") ||
      plugins.some((p) => p.id === "ads1299" && p.loaded));

  return (
    <div>
      {showAds ? (
        <Ads1299ConfigPanel
          value={frontEnd}
          live={Boolean(selected?.live && selected.kind === "ads1299")}
          busy={busy}
          onChange={setFrontEnd}
          onApply={() =>
            void applyFrontEnd(
              selected?.kind === "ads1299" ? selected.id : undefined,
              Boolean(selected?.live && selected.kind === "ads1299"),
            )
          }
        />
      ) : null}
      <DeviceScanPanel
        selected={selected}
        scanning={scanning}
        connecting={busy && !scanning}
        scanned={scanned}
        connected={connectedLive}
        hints={scanHint}
        codes={scanCodes}
        onScan={scan}
        onSelect={connect}
        onDisconnect={disconnect}
        onRescan={scan}
      />

      {selected ? (
        <ElectrodeMapPanel
          initial={app?.montage || null}
          nChannels={selected.nChannels || app?.montage?.n_channels}
          deviceKind={selected.kind}
          disabled={busy}
          onToast={onToast}
          onChanged={() => {
            void onRefreshApp();
          }}
        />
      ) : null}

      <details
        className="sb-plugins-fold"
        open={pluginsOpen}
        onToggle={(e) => setPluginsOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>Device plugins</summary>
        <p className="sb-muted">Install → รัน serve → Attach gRPC</p>
        <ul className="sb-list">
          {plugins.map((p) => (
            <li key={p.id} className="sb-plugin-card">
              <div className="sb-plugin-head">
                <strong>{p.title}</strong>
                <span className="sb-plugin-badge">
                  {p.loaded ? "loaded" : p.installed ? "installed" : "missing"}
                </span>
              </div>
              <p className="sb-muted">{p.blurb}</p>
              <code className="sb-plugin-cmd">
                {p.serve} --port {p.default_port}
              </code>
              <div className="sb-row">
                <button
                  type="button"
                  className={`sb-btn ${p.installed ? "" : "primary"}`}
                  disabled={busy}
                  onClick={() => onInstall(p.id)}
                >
                  {p.installed ? "Reinstall" : "Install"}
                </button>
                <button
                  type="button"
                  className="sb-btn primary"
                  disabled={busy}
                  onClick={() => onAttach(p.id, p.endpoint)}
                >
                  Attach
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="sb-btn" disabled={busy} onClick={onReload}>
          Reload plugins
        </button>
      </details>
    </div>
  );
}

function MentalInspector({
  node,
  app,
  onChangeNode,
  onRefreshApp,
  onToast,
}: {
  node: Node;
  app: AppState | null;
  onChangeNode: Props["onChangeNode"];
  onRefreshApp: Props["onRefreshApp"];
  onToast: Props["onToast"];
}) {
  const data = node.data as MentalNodeData;
  const [name, setName] = useState("");
  const [action, setAction] = useState(data.action || "Push");
  const [threshold, setThreshold] = useState(data.mentalThreshold ?? 0.55);
  const [debounce, setDebounce] = useState(data.debounceMs ?? 400);
  const [busy, setBusy] = useState(false);
  const profiles = app?.profiles || [];
  const activeId = data.profileId || app?.profile?.id || "";
  const catalog =
    app?.train_actions?.length
      ? app.train_actions
      : ["Neutral", "Push", "Pull", "Lift", "Drop", "Left", "Right"];
  const actionTh: Record<string, string> = {
    Neutral: "หยุดนิ่ง",
    Push: "ดัน",
    Pull: "ดึง",
    Lift: "ยก",
    Drop: "กด",
    Left: "ซ้าย",
    Right: "ขวา",
  };
  const trainBank = app?.train_bank || [];
  const collected = new Set(trainBank.map((b) => b.action));
  const pending = catalog.filter((a) => !collected.has(a));
  const hasCalib = Boolean(app?.profile?.has_calibration);
  const hasModel = Boolean(app?.profile?.has_model);
  const calibActive = Boolean(app?.calib?.active);
  const trainPhase = app?.train?.phase || "idle";
  // Only cue/rest lock the UI — completed classes leave the cue and enter train_bank.
  const trainRecording = trainPhase === "cue" || trainPhase === "rest";
  const liveOn = Boolean(app?.mental_live);

  // Auto-focus the current step: 1 profile → 2 calibrate → 3 train → 4 live
  const step = !activeId
    ? 1
    : !hasCalib || calibActive
      ? 2
      : !hasModel || trainRecording || trainBank.length > 0
        ? 3
        : 4;

  useEffect(() => {
    setThreshold(data.mentalThreshold ?? 0.55);
    setDebounce(data.debounceMs ?? 400);
  }, [data.mentalThreshold, data.debounceMs]);

  useEffect(() => {
    const done = app?.train_last_completed;
    if (!done) return;
    onToast(`ครบ ${done} — ย้ายเข้าลิสต์เก็บแล้ว`);
    // Prefer the next uncollected class.
    setAction((prev) => {
      const next = catalog.find((a) => a !== done && !collected.has(a));
      return next || prev;
    });
  }, [app?.train_last_completed, onToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      await onRefreshApp();
      onToast(ok);
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sb-mental">
      <ol className="sb-mental-steps" aria-label="ขั้นตอนฝึก Mental">
        <li className={step === 1 ? "current" : activeId ? "done" : ""}>
          <span>1</span>โปรไฟล์
        </li>
        <li className={step === 2 ? "current" : hasCalib ? "done" : ""}>
          <span>2</span>คาลิเบรต
        </li>
        <li className={step === 3 ? "current" : hasModel ? "done" : ""}>
          <span>3</span>เทรน
        </li>
        <li className={step === 4 ? "current" : liveOn ? "done" : ""}>
          <span>4</span>ใช้งาน
        </li>
      </ol>

      <section className={`sb-mental-card ${step === 1 ? "focus" : ""}`}>
        <header>
          <h3>1 · โปรไฟล์</h3>
          <p>เลือกหรือสร้างโปรไฟล์ก่อนเริ่ม</p>
        </header>
        <label className="sb-field">
          <span>โปรไฟล์ที่ใช้</span>
          <select
            value={activeId}
            disabled={busy}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              void run(() => selectProfile(id), `เปิด ${id}`).then(() =>
                onChangeNode(node.id, { ...data, profileId: id }),
              );
            }}
          >
            <option value="">— เลือก —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="sb-row">
          <input
            className="sb-input"
            placeholder="ชื่อโปรไฟล์ใหม่"
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            className="sb-btn primary"
            disabled={busy || !name.trim()}
            onClick={() =>
              void run(async () => {
                const state = await createProfile(name.trim());
                setName("");
                const id = state.profile?.id;
                if (id) onChangeNode(node.id, { ...data, profileId: id });
              }, "สร้างโปรไฟล์แล้ว")
            }
          >
            สร้าง
          </button>
        </div>
        <button
          type="button"
          className="sb-btn danger"
          disabled={busy || !activeId || profiles.length <= 1}
          onClick={() => {
            if (!activeId) return;
            const label =
              profiles.find((p) => p.id === activeId)?.name || activeId;
            if (!window.confirm(`ลบโปรไฟล์ “${label}” ?`)) return;
            void run(async () => {
              const state = await deleteProfile(activeId);
              onChangeNode(node.id, {
                ...data,
                profileId: state.profile?.id,
              });
            }, "ลบโปรไฟล์แล้ว");
          }}
        >
          ลบโปรไฟล์นี้
        </button>
      </section>

      <section className={`sb-mental-card ${step === 2 ? "focus" : ""}`}>
        <header>
          <h3>2 · คาลิเบรต</h3>
          <p>นั่งนิ่งตาเปิด ~30 วิ เพื่อตั้งค่าพื้นฐาน</p>
        </header>
        {calibActive ? (
          <div className="sb-mental-progress" aria-live="polite">
            <div
              className="sb-mental-bar"
              style={{
                width: `${Math.min(100, Math.round(Math.max(app?.calib?.progress || 0, 0) * 1000) / 10)}%`,
              }}
            />
            <span>
              {Math.min(
                100,
                Math.round(Math.max(app?.calib?.progress || 0, 0) * 100),
              )}
              %
            </span>
          </div>
        ) : (
          <p className={`sb-mental-status ${hasCalib ? "ok" : ""}`}>
            {hasCalib ? "คาลิเบรตแล้ว — พร้อมเทรน" : "ยังไม่คาลิเบรต"}
          </p>
        )}
        <div className="sb-row">
          <button
            type="button"
            className="sb-btn primary"
            disabled={busy || !activeId || calibActive}
            onClick={() => run(() => startCalibrate(), "เริ่มคาลิเบรต")}
          >
            เริ่มคาลิเบรต
          </button>
          <button
            type="button"
            className="sb-btn"
            disabled={busy || !calibActive}
            onClick={() => run(() => stopCalibrate(), "หยุดคาลิเบรต")}
          >
            หยุด
          </button>
        </div>
      </section>

      <section className={`sb-mental-card ${step === 3 ? "focus" : ""}`}>
        <header>
          <h3>3 · เทรนคำสั่ง</h3>
          <p>เลือกคำสั่ง → ตาม animation ขณะ record → หยุดเองเมื่อครบรอบ</p>
        </header>

        {pending.length > 0 ? (
          <div className="sb-train-actions" role="listbox" aria-label="คำสั่งที่ยังไม่เก็บ">
            {pending.map((a) => {
              const selected = action === a;
              return (
                <button
                  key={a}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`sb-train-action ${selected ? "selected" : ""}`}
                  disabled={busy || trainRecording}
                  onClick={() => setAction(a)}
                >
                  <span className={`sb-train-action-ico motion-${a.toLowerCase()}`} aria-hidden />
                  <strong>{a === "Neutral" ? "หยุดนิ่ง" : a}</strong>
                  <em>{actionTh[a] || a}</em>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="sb-mental-status ok">เก็บครบทุกคำสั่งแล้ว — กด Fit ได้</p>
        )}

        {trainBank.length > 0 && (
          <div className="sb-train-bank" aria-label="คำสั่งที่เก็บแล้ว">
            <header>
              <strong>เก็บแล้ว</strong>
              <span>{trainBank.length} class</span>
            </header>
            <ul>
              {trainBank.map((b) => (
                <li key={b.action}>
                  <button
                    type="button"
                    className={action === b.action ? "active" : ""}
                    disabled={busy || trainRecording}
                    onClick={() => setAction(b.action)}
                    title="เลือกเพื่อเก็บเพิ่ม"
                  >
                    <span className={`sb-train-action-ico motion-${b.action.toLowerCase()}`} aria-hidden />
                    <strong>{b.action === "Neutral" ? "หยุดนิ่ง" : b.action}</strong>
                    <em>
                      {b.blocks > 0 ? `${b.blocks} บล็อก` : "มีข้อมูล"} · {b.samples} ตัวอย่าง
                    </em>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {trainRecording && app?.train ? (
          <TrainCue train={app.train} />
        ) : (
          <p className={`sb-mental-status ${hasModel ? "ok" : ""}`}>
            {hasModel
              ? `มีโมเดลแล้ว${
                  app?.profile?.last_cv_accuracy != null
                    ? ` · CV ${(app.profile.last_cv_accuracy * 100).toFixed(0)}%`
                    : ""
                }`
              : hasCalib
                ? pending.length
                  ? "เลือกคำสั่ง แล้วกดเริ่ม — จะมีตัวกระตุ้นให้คิดตาม"
                  : "พร้อม Fit โมเดล หรือเลือกจากลิสต์เก็บแล้วเพื่อเก็บเพิ่ม"
                : "คาลิเบรตก่อน แล้วค่อยเทรน"}
          </p>
        )}

        <div className="sb-row">
          <button
            type="button"
            className="sb-btn primary"
            disabled={busy || !hasCalib || trainRecording}
            onClick={() =>
              run(() => {
                onChangeNode(node.id, { ...data, action });
                return startTrain(action);
              }, `เริ่มเทรน ${action} — คิดตามภาพ`)
            }
          >
            เริ่มเก็บข้อมูล
          </button>
          <button
            type="button"
            className="sb-btn"
            disabled={busy || !trainRecording}
            onClick={() => run(() => stopTrain(), "หยุดเทรน")}
          >
            หยุด
          </button>
        </div>
        <button
          type="button"
          className="sb-btn primary block"
          disabled={busy || trainRecording || !hasCalib || trainBank.length < 2}
          onClick={() => run(() => fitTrain(), "Fit โมเดลแล้ว")}
        >
          Fit โมเดล (LDA)
        </button>
      </section>

      <section className={`sb-mental-card ${step === 4 ? "focus" : ""}`}>
        <header>
          <h3>4 · ใช้งานจริง</h3>
          <p>ตั้งความไว แล้วเปิด Mental live</p>
        </header>
        <div className="sb-mental-tune">
          <label className="sb-field">
            <span>Threshold</span>
            <input
              className="sb-input"
              type="number"
              step="0.05"
              min={0}
              max={1}
              value={threshold}
              disabled={busy}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          </label>
          <label className="sb-field">
            <span>Debounce ms</span>
            <input
              className="sb-input"
              type="number"
              step={50}
              value={debounce}
              disabled={busy}
              onChange={(e) => setDebounce(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="sb-row">
          <button
            type="button"
            className="sb-btn"
            disabled={busy}
            onClick={() =>
              run(async () => {
                onChangeNode(node.id, {
                  ...data,
                  mentalThreshold: threshold,
                  debounceMs: debounce,
                });
                await updateControl({
                  mental_threshold: threshold,
                  debounce_ms: debounce,
                  keymap: data.keymap,
                });
              }, "บันทึกค่าควบคุมแล้ว")
            }
          >
            บันทึก
          </button>
          <button
            type="button"
            className={`sb-btn ${liveOn ? "primary" : ""}`}
            disabled={busy || !hasModel}
            onClick={() =>
              run(
                () => setMentalLive(!liveOn),
                liveOn ? "ปิด Mental live" : "เปิด Mental live",
              )
            }
          >
            {liveOn ? "Live ON" : "เปิด Live"}
          </button>
        </div>
      </section>
    </div>
  );
}

function OutputInspector({
  node,
  onChangeNode,
  onToast,
}: {
  node: Node;
  onChangeNode: Props["onChangeNode"];
  onToast: Props["onToast"];
}) {
  const data = node.data as OutputNodeData;

  const patch = (partial: Partial<OutputNodeData>) => {
    onChangeNode(node.id, { ...data, ...partial });
  };

  return (
    <div>
      <p className="sb-muted">
        Kind <code>{data.kind}</code> — ลากเส้นจาก Mental แล้วกด Apply
      </p>

      {data.kind === "game" ? (
        <>
          <a className="sb-btn primary block" href="/game" target="_blank" rel="noreferrer">
            เปิดเกม 7Being World ↗
          </a>
          <p className="sb-muted">
            Push/W หน้า · Pull/S ถอย · A/D ซ้ายขวา · Space/Blink กระโดด
          </p>
          <label className="sb-check">
            <input
              type="checkbox"
              checked={!!data.keysEnabled}
              onChange={async (e) => {
                const enabled = e.target.checked;
                patch({ keysEnabled: enabled });
                try {
                  await setKeysEnabled(enabled);
                  onToast(enabled ? "keys on" : "keys off");
                } catch (err) {
                  onToast(err instanceof Error ? err.message : String(err));
                }
              }}
            />
            OS key inject (นอกเบราว์เซอร์)
          </label>
        </>
      ) : null}

      {data.kind === "mqtt" ? (
        <>
          <label className="sb-field">
            <span>Broker</span>
            <input
              className="sb-input"
              value={data.broker || ""}
              onChange={(e) => patch({ broker: e.target.value })}
            />
          </label>
          <label className="sb-field">
            <span>Topic</span>
            <input
              className="sb-input"
              value={data.topic || ""}
              onChange={(e) => patch({ topic: e.target.value })}
            />
          </label>
        </>
      ) : null}

      {data.kind === "serialport" ? (
        <>
          <label className="sb-field">
            <span>Port</span>
            <input
              className="sb-input"
              value={data.port || ""}
              onChange={(e) => patch({ port: e.target.value })}
              placeholder="/dev/tty.usbserial"
            />
          </label>
          <label className="sb-field">
            <span>Baud</span>
            <input
              className="sb-input"
              type="number"
              value={data.baudrate ?? 115200}
              onChange={(e) => patch({ baudrate: Number(e.target.value) })}
            />
          </label>
        </>
      ) : null}

      {data.kind === "tcpudp" ? (
        <>
          <label className="sb-field">
            <span>Transport</span>
            <select
              value={data.transport || "udp"}
              onChange={(e) =>
                patch({ transport: e.target.value as "tcp" | "udp" })
              }
            >
              <option value="udp">UDP</option>
              <option value="tcp">TCP</option>
            </select>
          </label>
          <label className="sb-field">
            <span>Host</span>
            <input
              className="sb-input"
              value={data.host || ""}
              onChange={(e) => patch({ host: e.target.value })}
            />
          </label>
          <label className="sb-field">
            <span>Port</span>
            <input
              className="sb-input"
              type="number"
              value={data.tcpPort ?? 7700}
              onChange={(e) => patch({ tcpPort: Number(e.target.value) })}
            />
          </label>
        </>
      ) : null}

      {data.kind === "grpc" || data.kind === "custom" ? (
        <p className="sb-muted">
          Hook publishers from Python (`set_publisher` / `on`). Apply enables
          the sink.
        </p>
      ) : null}
    </div>
  );
}
