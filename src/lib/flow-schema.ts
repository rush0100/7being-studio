import type { Edge, Node } from "@xyflow/react";
import {
  configureOutput,
  disableOutput,
  enableOutput,
  type AppState,
} from "./bci-client";

export const OUTPUT_KINDS = [
  "game",
  "mqtt",
  "serialport",
  "tcpudp",
  "grpc",
  "custom",
] as const;

export type OutputKind = (typeof OUTPUT_KINDS)[number];

export type DeviceNodeData = {
  label: string;
  deviceId?: string;
  deviceName?: string;
  deviceKind?: string;
  nChannels?: number;
};

export type MentalNodeData = {
  label: string;
  profileId?: string;
  action?: string;
  mentalThreshold?: number;
  debounceMs?: number;
  keymap?: Record<string, string>;
};

export type OutputNodeData = {
  label: string;
  kind: OutputKind;
  // mqtt
  broker?: string;
  topic?: string;
  // serial
  port?: string;
  baudrate?: number;
  // tcpudp
  transport?: "tcp" | "udp";
  host?: string;
  tcpPort?: number;
  // game
  keysEnabled?: boolean;
};

export type StudioNode =
  | Node<DeviceNodeData, "device">
  | Node<MentalNodeData, "mental">
  | Node<OutputNodeData, "output">;

export const FLOW_STORAGE_KEY = "7being-studio-flow-v1";

const NODE_SHELL = {
  background: "transparent",
  border: "none",
  padding: 0,
  boxShadow: "none",
} as const;

export function defaultNodes(): StudioNode[] {
  return [
    {
      id: "device",
      type: "device",
      position: { x: 60, y: 180 },
      data: { label: "Device" },
      deletable: false,
      style: { ...NODE_SHELL },
    },
    {
      id: "mental",
      type: "mental",
      position: { x: 340, y: 180 },
      data: {
        label: "Mental",
        mentalThreshold: 0.55,
        debounceMs: 400,
        keymap: {
          Push: "w",
          Pull: "s",
          Lift: "q",
          Drop: "e",
          Left: "a",
          Right: "d",
        },
      },
      deletable: false,
      style: { ...NODE_SHELL },
    },
    {
      id: "out-game",
      type: "output",
      position: { x: 640, y: 80 },
      data: {
        label: "Game",
        kind: "game",
        keysEnabled: false,
      },
      style: { ...NODE_SHELL },
    },
  ];
}

export function defaultEdges(): Edge[] {
  return [
    { id: "e-device-mental", source: "device", target: "mental" },
    { id: "e-mental-game", source: "mental", target: "out-game" },
  ];
}

export function outputNodeId(kind: OutputKind): string {
  return `out-${kind}`;
}

export function makeOutputNode(kind: OutputKind, index = 0): StudioNode {
  const titles: Record<OutputKind, string> = {
    game: "Game",
    mqtt: "MQTT",
    serialport: "Serial",
    tcpudp: "TCP/UDP",
    grpc: "gRPC",
    custom: "Custom",
  };
  const base: OutputNodeData = {
    label: titles[kind],
    kind,
  };
  if (kind === "mqtt") {
    base.broker = "mqtt://127.0.0.1:1883";
    base.topic = "7being/bci/control";
  }
  if (kind === "serialport") {
    base.port = "";
    base.baudrate = 115200;
  }
  if (kind === "tcpudp") {
    base.transport = "udp";
    base.host = "127.0.0.1";
    base.tcpPort = 7700;
  }
  if (kind === "game") {
    base.keysEnabled = false;
  }
  return {
    id: outputNodeId(kind),
    type: "output",
    position: { x: 640, y: 80 + index * 110 },
    data: base,
    style: { ...NODE_SHELL },
  };
}

/** Outputs that should be enabled given Mental → Output edges. */
export function enabledKindsFromGraph(
  nodes: Node[],
  edges: Edge[],
): OutputKind[] {
  const mentalId = nodes.find((n) => n.type === "mental")?.id;
  if (!mentalId) return [];
  const kinds: OutputKind[] = [];
  for (const e of edges) {
    if (e.source !== mentalId) continue;
    const target = nodes.find((n) => n.id === e.target);
    if (target?.type !== "output") continue;
    const kind = (target.data as OutputNodeData).kind;
    if (OUTPUT_KINDS.includes(kind)) kinds.push(kind);
  }
  return kinds;
}

export async function applyFlowToApi(
  nodes: Node[],
  edges: Edge[],
): Promise<{ enabled: string[]; messages: string[] }> {
  const messages: string[] = [];
  const want = new Set(enabledKindsFromGraph(nodes, edges));

  // Disable sinks that are registered but not edged
  for (const kind of OUTPUT_KINDS) {
    try {
      if (want.has(kind)) {
        await enableOutput(kind);
        messages.push(`enabled ${kind}`);
      } else {
        await disableOutput(kind);
        messages.push(`disabled ${kind}`);
      }
    } catch (err) {
      messages.push(`${kind}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Configure each output node present on canvas
  for (const node of nodes) {
    if (node.type !== "output") continue;
    const data = node.data as OutputNodeData;
    const opts: Record<string, unknown> = {};
    if (data.kind === "mqtt") {
      if (data.broker) opts.broker = data.broker;
      if (data.topic) opts.topic = data.topic;
    } else if (data.kind === "serialport") {
      if (data.port !== undefined) opts.port = data.port;
      if (data.baudrate !== undefined) opts.baudrate = data.baudrate;
    } else if (data.kind === "tcpudp") {
      if (data.transport) opts.transport = data.transport;
      if (data.host) opts.host = data.host;
      if (data.tcpPort !== undefined) opts.port = data.tcpPort;
    }
    if (Object.keys(opts).length === 0) continue;
    try {
      await configureOutput(data.kind, opts);
      messages.push(`configured ${data.kind}`);
    } catch (err) {
      messages.push(
        `configure ${data.kind}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { enabled: [...want], messages };
}

export function hydrateFromApp(app: AppState, nodes: Node[]): Node[] {
  const enabled = new Set(
    app.outputs?.enabled || app.channels?.enabled || [],
  );
  return nodes.map((n) => {
    if (n.type === "mental" && app.profile) {
      return {
        ...n,
        data: {
          ...(n.data as MentalNodeData),
          profileId: app.profile.id,
        },
      };
    }
    if (n.type === "output") {
      const data = n.data as OutputNodeData;
      return {
        ...n,
        data: {
          ...data,
          // visual hint only; Apply is source of truth
          label: enabled.has(data.kind)
            ? `${data.label.replace(/ ●$/, "")} ●`
            : data.label.replace(/ ●$/, ""),
        },
      };
    }
    return n;
  });
}

export type FlowDocument = {
  version: 1;
  nodes: Node[];
  edges: Edge[];
};

export function serializeFlow(nodes: Node[], edges: Edge[]): FlowDocument {
  return { version: 1, nodes, edges };
}

export function loadFlowFromStorage(): FlowDocument | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FLOW_STORAGE_KEY);
    if (!raw) return null;
    const doc = JSON.parse(raw) as FlowDocument;
    if (doc.version !== 1 || !Array.isArray(doc.nodes)) return null;
    return doc;
  } catch {
    return null;
  }
}

export function saveFlowToStorage(nodes: Node[], edges: Edge[]): void {
  localStorage.setItem(
    FLOW_STORAGE_KEY,
    JSON.stringify(serializeFlow(nodes, edges)),
  );
}
