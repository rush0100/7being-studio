"use client";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CollabCredit } from "@/components/CollabCredit";
import { useI18n, type Lang } from "@/lib/i18n";
import { RushMark } from "@/components/RushMark";
import { DeviceNode } from "@/components/nodes/DeviceNode";
import { MentalNode } from "@/components/nodes/MentalNode";
import { OutputNode } from "@/components/nodes/OutputNode";
import { Inspector } from "@/components/panels/Inspector";
import { LiveMonitor, type LiveSnapshot } from "@/components/panels/LiveMonitor";
import { LiveRail } from "@/components/panels/LiveRail";
import { normalizeBands } from "@/lib/live-labels";
import { normalizeChannelBands } from "@/lib/cortex-map";
import {
  connectWorker,
  getApp,
  probeApi,
  stopWorker,
  subscribeEvents,
  type AppState,
} from "@/lib/bci-client";
import { DEFAULT_CH } from "@/lib/live-labels";
import {
  OUTPUT_KINDS,
  applyFlowToApi,
  defaultEdges,
  defaultNodes,
  loadFlowFromStorage,
  makeOutputNode,
  outputNodeId,
  saveFlowToStorage,
  serializeFlow,
  type OutputKind,
} from "@/lib/flow-schema";

const nodeTypes = {
  device: DeviceNode,
  mental: MentalNode,
  output: OutputNode,
};

export function FlowCanvas() {
  const { t, lang, setLang } = useI18n();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(defaultNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(defaultEdges());
  const [selected, setSelected] = useState<Node | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [app, setApp] = useState<AppState | null>(null);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [status, setStatus] = useState("Booting…");
  const [command, setCommand] = useState("Neutral");
  const [keyName, setKeyName] = useState("");
  const [confidence, setConfidence] = useState(0);
  const [source, setSource] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [toast, setToast] = useState("");
  const [applying, setApplying] = useState(false);
  const [view, setView] = useState<"flow" | "live">("flow");
  const [live, setLive] = useState<LiveSnapshot>({
    samples: [],
    cq: [],
    affect: [],
    face: [],
    bands: null,
    channelBands: null,
    battery: null,
    signal: null,
    pktS: 0,
    sampleS: 0,
    channelLabels: [...DEFAULT_CH],
    closed: [],
    brain: null,
    motion: null,
  });
  const hydrated = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sampleBuf = useRef<number[][]>([]);
  const liveFlush = useRef(0);

  const toastMsg = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2800);
  }, []);

  const refreshApp = useCallback(async () => {
    const state = await getApp();
    setApp(state);
    return state;
  }, []);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const doc = loadFlowFromStorage();
    if (doc) {
      setNodes(
        doc.nodes.map((n) => ({
          ...n,
          style: {
            background: "transparent",
            border: "none",
            padding: 0,
            boxShadow: "none",
            ...(n.style || {}),
          },
        })),
      );
      setEdges(doc.edges);
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = await probeApi();
      if (!alive) return;
      setApiOk(ok);
      if (!ok) {
        setStatus("API ออฟไลน์ — รัน Python ที่ :8765");
        return;
      }
      try {
        const state = await refreshApp();
        setStatus("พร้อมใช้งาน");
        if (state.control) {
          setCommand(state.control.name);
          setKeyName(state.control.key);
          setConfidence(state.control.confidence);
          setSource(state.control.source);
        }
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [refreshApp]);

  useEffect(() => {
    if (!apiOk) return;
    return subscribeEvents((kind, raw) => {
      const data = raw as Record<string, unknown>;
      if (kind === "status") {
        setStatus(String(data.text || data.banner || ""));
      }
      if (kind === "command") {
        setCommand(String(data.name || "Neutral"));
        setKeyName(String(data.key || ""));
        setConfidence(Number(data.confidence || 0));
        setSource(String(data.source || ""));
      }
      if (kind === "app") {
        const appState = data as AppState;
        setApp(appState);
        const ch = appState.montage?.channels;
        const closed = appState.montage?.closed;
        if (Array.isArray(ch) && ch.length) {
          setLive((L) => ({
            ...L,
            channelLabels: ch.map(String),
            closed: Array.isArray(closed) ? closed.map(Number) : L.closed,
          }));
        } else if (Array.isArray(closed)) {
          setLive((L) => ({ ...L, closed: closed.map(Number) }));
        }
      }
      if (kind === "stats") {
        setLive((L) => ({
          ...L,
          pktS: Number(data.pkt_s ?? L.pktS),
          sampleS: Number(data.sample_s ?? L.sampleS),
          battery:
            data.battery == null ? L.battery : Number(data.battery),
        }));
      }
      if (kind === "sample") {
        const rows =
          (data.rows as number[][] | undefined) ||
          (data.values ? [data.values as number[]] : []);
        if (rows.length) {
          // Keep ~1s of EEG at 128 Hz for a snappy Live trace.
          sampleBuf.current = [...sampleBuf.current, ...rows].slice(-128);
          const now = performance.now();
          if (now - liveFlush.current > 16) {
            liveFlush.current = now;
            const snap = sampleBuf.current.slice();
            setLive((L) => ({ ...L, samples: snap }));
          }
        }
      }
      if (kind === "cq") {
        setLive((L) => ({
          ...L,
          cq: Array.isArray(data.values) ? (data.values as (number | null)[]) : L.cq,
        }));
      }
      if (kind === "affect") {
        setLive((L) => ({
          ...L,
          affect: Array.isArray(data.values)
            ? (data.values as (number | null)[])
            : L.affect,
        }));
      }
      if (kind === "face") {
        setLive((L) => ({
          ...L,
          face: Array.isArray(data.values)
            ? (data.values as (number | null)[])
            : L.face,
        }));
      }
      if (kind === "bands") {
        setLive((L) => ({
          ...L,
          bands:
            data.values == null
              ? null
              : normalizeBands(data.values) ?? L.bands,
          channelBands:
            data.channels == null
              ? null
              : normalizeChannelBands(data.channels) ?? L.channelBands,
        }));
      }
      if (kind === "signal") {
        setLive((L) => ({
          ...L,
          signal: data.value == null ? null : Number(data.value),
        }));
      }
      if (kind === "brain") {
        setLive((L) => ({ ...L, brain: data as LiveSnapshot["brain"] }));
      }
      if (kind === "motion") {
        if (data.available === false) {
          setLive((L) => ({ ...L, motion: null }));
          return;
        }
        const quat = Array.isArray(data.quat) ? (data.quat as number[]) : null;
        const accel = Array.isArray(data.accel) ? (data.accel as number[]) : null;
        const mag = Array.isArray(data.mag) ? (data.mag as number[]) : null;
        const eulerRaw = data.euler as
          | { yaw?: number; pitch?: number; roll?: number }
          | undefined;
        const euler =
          eulerRaw && typeof eulerRaw === "object"
            ? {
                yaw: Number(eulerRaw.yaw) || 0,
                pitch: Number(eulerRaw.pitch) || 0,
                roll: Number(eulerRaw.roll) || 0,
              }
            : undefined;
        if (quat || accel || mag) {
          setLive((L) => ({
            ...L,
            motion: {
              quat: quat || L.motion?.quat || [1, 0, 0, 0],
              accel: accel || L.motion?.accel || [0, 0, 0],
              mag: mag || L.motion?.mag || [0, 0, 0],
              gyro: Array.isArray(data.gyro) ? (data.gyro as number[]) : L.motion?.gyro,
              euler: euler || L.motion?.euler,
              still:
                typeof data.still === "boolean"
                  ? Boolean(data.still)
                  : L.motion?.still,
              values: Array.isArray(data.values)
                ? (data.values as number[])
                : L.motion?.values,
              axes: Array.isArray(data.axes) ? (data.axes as string[]) : L.motion?.axes,
            },
          }));
        }
      }
      if (kind === "history") {
        const hist = data as {
          command?: string;
          key?: string;
          app?: AppState;
          samples?: number[][];
          cq?: (number | null)[];
          affect?: (number | null)[];
          face?: number[];
          bands?: number[] | null;
          channel_bands?: number[][] | null;
          battery?: number | null;
          signal?: number | null;
          brain?: LiveSnapshot["brain"];
          motion_last?: LiveSnapshot["motion"];
        };
        if (hist.command) setCommand(hist.command);
        if (hist.key !== undefined) setKeyName(hist.key);
        if (hist.app) setApp(hist.app);
        if (hist.samples?.length || hist.brain || hist.bands || hist.channel_bands) {
          if (hist.samples?.length) {
            sampleBuf.current = hist.samples.slice(-128);
          }
          setLive((L) => ({
            ...L,
            samples: hist.samples?.length ? sampleBuf.current.slice() : L.samples,
            cq: hist.cq || L.cq,
            affect: hist.affect || L.affect,
            face: hist.face || L.face,
            bands: hist.bands != null ? normalizeBands(hist.bands) ?? L.bands : L.bands,
            channelBands:
              hist.channel_bands != null
                ? normalizeChannelBands(hist.channel_bands) ?? L.channelBands
                : L.channelBands,
            battery: hist.battery ?? L.battery,
            signal: hist.signal ?? L.signal,
            brain: hist.brain ?? L.brain,
            motion:
              "motion_last" in hist
                ? (hist.motion_last ?? null)
                : L.motion,
            channelLabels: hist.app?.montage?.channels?.map(String) || L.channelLabels,
            closed: Array.isArray(hist.app?.montage?.closed)
              ? hist.app.montage.closed.map(Number)
              : L.closed,
          }));
        }
      }
    });
  }, [apiOk]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, animated: true }, eds));
    },
    [setEdges],
  );

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    const node = params.nodes[0] || null;
    setSelected(node);
    setDrawerOpen(!!node);
  }, []);

  const onChangeNode = useCallback(
    (id: string, data: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)),
      );
      setSelected((cur) =>
        cur && cur.id === id ? { ...cur, data: { ...cur.data, ...data } } : cur,
      );
    },
    [setNodes],
  );

  const addOutput = (kind: OutputKind) => {
    const id = outputNodeId(kind);
    if (nodes.some((n) => n.id === id)) {
      toastMsg(`${kind} มีบนแคนวาสแล้ว`);
      return;
    }
    const index = nodes.filter((n) => n.type === "output").length;
    setNodes((nds) => [...nds, makeOutputNode(kind, index)]);
    toastMsg(`เพิ่ม ${kind}`);
  };

  const apply = async () => {
    setApplying(true);
    try {
      const result = await applyFlowToApi(nodes, edges);
      saveFlowToStorage(nodes, edges);
      await refreshApp();
      toastMsg(`Apply · ${result.enabled.join(", ") || "none"}`);
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  };

  const saveLocal = () => {
    saveFlowToStorage(nodes, edges);
    setMenuOpen(false);
    toastMsg("บันทึกแล้ว");
  };

  const exportJson = () => {
    const blob = new Blob(
      [JSON.stringify(serializeFlow(nodes, edges), null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "7being-flow.json";
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const doc = JSON.parse(String(reader.result));
        if (!doc.nodes || !doc.edges) throw new Error("invalid flow");
        setNodes(doc.nodes);
        setEdges(doc.edges);
        saveFlowToStorage(doc.nodes, doc.edges);
        toastMsg("โหลด flow แล้ว");
      } catch (e) {
        toastMsg(e instanceof Error ? e.message : String(e));
      }
    };
    reader.readAsText(file);
    setMenuOpen(false);
  };

  const onConnectStream = async () => {
    try {
      await connectWorker();
      setStreaming(true);
      toastMsg("เริ่มสตรีม");
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const onStopStream = async () => {
    try {
      await stopWorker();
      setStreaming(false);
      toastMsg("หยุดสตรีม");
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const palette = useMemo(
    () =>
      OUTPUT_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          className="sb-chip"
          onClick={() => addOutput(kind)}
        >
          + {kind}
        </button>
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes],
  );

  return (
    <div className="sb-shell">
      <header className="sb-top">
        <div className="sb-brand">
          <RushMark size={28} />
          <div className="sb-brand-text">
            <span className="sb-mark">{t("realm")}</span>
            {t("studio") ? <span className="sb-powered">{t("studio")}</span> : null}
          </div>
          <CollabCredit compact />
        </div>
        <div className="sb-top-actions">
          <div className="sb-lang" role="group" aria-label={t("lang")}>
            {(["th", "zh", "en"] as Lang[]).map((code) => (
              <button
                key={code}
                type="button"
                className={`sb-btn ${lang === code ? "primary" : ""}`}
                aria-pressed={lang === code}
                onClick={() => setLang(code)}
              >
                {code === "th" ? "ไทย" : code === "zh" ? "中文" : "EN"}
              </button>
            ))}
          </div>
          <div className="sb-view-toggle" role="tablist" aria-label={t("view")}>
            <button
              type="button"
              role="tab"
              aria-selected={view === "flow"}
              className={`sb-btn ${view === "flow" ? "primary" : ""}`}
              onClick={() => setView("flow")}
            >
              {t("flow")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "live"}
              className={`sb-btn ${view === "live" ? "primary" : ""}`}
              onClick={() => setView("live")}
            >
              {t("live")}
            </button>
          </div>
          {view === "flow" ? (
            <button
              type="button"
              className="sb-btn primary"
              disabled={applying || !apiOk}
              onClick={apply}
              title="Apply flow to API"
            >
              {applying ? "…" : "Apply"}
            </button>
          ) : null}
          <div className="sb-menu">
            <button
              type="button"
              className="sb-btn icon"
              aria-label="เมนู"
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
            >
              ⋯
            </button>
            {menuOpen ? (
              <div className="sb-menu-panel" onClick={(e) => e.stopPropagation()}>
                <a className="sb-btn block" href="/game" target="_blank" rel="noreferrer">
                  เปิดเกม World
                </a>
                <button type="button" className="sb-btn block" onClick={saveLocal}>
                  บันทึก
                </button>
                <button type="button" className="sb-btn block" onClick={exportJson}>
                  ส่งออก
                </button>
                <button
                  type="button"
                  className="sb-btn block"
                  onClick={() => fileRef.current?.click()}
                >
                  นำเข้า
                </button>
              </div>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <LiveRail
        apiOk={apiOk}
        status={status}
        command={command}
        keyName={keyName}
        confidence={confidence}
        source={source}
        connected={streaming}
        onConnect={onConnectStream}
        onStop={onStopStream}
      />

      {view === "flow" ? (
        <div className="sb-stage">
          <div className="sb-palette">
            <span className="sb-palette-label">+ Output</span>
            {palette}
          </div>
          <div className="sb-canvas">
            <ReactFlow
              className="sb-flow"
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
              onPaneClick={() => {
                setDrawerOpen(false);
                setSelected(null);
              }}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.28 }}
              colorMode="dark"
              proOptions={{ hideAttribution: true }}
              minZoom={0.25}
              maxZoom={1.8}
              panOnDrag
              panOnScroll={false}
              zoomOnScroll
              zoomOnPinch
              zoomOnDoubleClick={false}
              selectionOnDrag={false}
              multiSelectionKeyCode={null}
              deleteKeyCode={["Backspace", "Delete"]}
              preventScrolling
              nodesDraggable
              nodesConnectable
              elementsSelectable
            >
              <Background gap={22} size={1} color="rgba(247,248,245,0.05)" />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                maskColor="rgba(14,22,40,0.75)"
                nodeColor={(n) =>
                  n.type === "device"
                    ? "#22c9a8"
                    : n.type === "mental"
                      ? "#5b8dff"
                      : "#c48763"
                }
              />
            </ReactFlow>
          </div>

          <Inspector
            node={selected}
            app={app}
            open={drawerOpen}
            onClose={() => {
              setDrawerOpen(false);
              setSelected(null);
            }}
            onChangeNode={onChangeNode}
            onRefreshApp={async () => {
              await refreshApp();
            }}
            onToast={toastMsg}
          />
        </div>
      ) : (
        <div className="sb-stage live-view">
          <LiveMonitor
            live={live}
            command={command}
            keyName={keyName}
            confidence={confidence}
          />
        </div>
      )}

      <p className="sb-hint">
        {view === "flow"
          ? "แตะโหนดเพื่อตั้งค่า · ลากเส้น Mental → Output · Apply"
          : "สมอง · เซ็นเซอร์→θ/α/β/γ · กลีบสมอง · CQ · fullscreen"}
      </p>

      {toast ? <div className="sb-toast">{toast}</div> : null}
    </div>
  );
}
