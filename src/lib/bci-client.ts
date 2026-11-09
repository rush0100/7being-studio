/** Browser client for the Python BCI API (proxied via /api/bci). */

const BASE = "/api/bci";
/** Direct SSE avoids Next.js rewrite buffering (keeps Live near realtime). */
const SSE_BASE = process.env.NEXT_PUBLIC_BCI_SSE_URL || "http://127.0.0.1:8765";

async function req<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const err =
      typeof body === "object" && body && "error" in body
        ? String((body as { error: unknown }).error)
        : res.statusText;
    throw new Error(err || `HTTP ${res.status}`);
  }
  return body as T;
}

export type AppState = {
  profile?: {
    id: string;
    name: string;
    actions?: string[];
    has_calibration?: boolean;
    has_model?: boolean;
    last_cv_accuracy?: number | null;
  } | null;
  profiles?: { id: string; name: string }[];
  calib?: { active: boolean; progress: number };
  train?: {
    action: string;
    phase: string; // idle | cue | rest | done
    trial: number;
    trials_total: number;
    progress: number;
    message: string;
  };
  /** Classes already collected this session (moved out of the picker). */
  train_bank?: { action: string; samples: number; blocks: number }[];
  train_last_completed?: string | null;
  mental?: { label: string; confidence: number } | null;
  mental_live?: boolean;
  control?: { name: string; key: string; source: string; confidence: number };
  channels?: OutputsState;
  outputs?: OutputsState;
  devices?: DevicesState;
  montage?: MontageState;
  session?: { active: boolean; path?: string | null; rows: number };
  train_actions?: string[];
};

export type MontageSite = {
  name: string;
  x: number;
  y: number;
  ref?: boolean;
};

export type MontageState = {
  channels?: string[];
  n_channels?: number;
  sample_rate_hz?: number;
  units?: string;
  reference?: string;
  sites?: MontageSite[];
  ref_candidates?: string[];
  assignments?: string[];
  /** Channel indexes the user turned off. */
  closed?: number[];
};

export type OutputsState = {
  enabled: string[];
  last?: { name: string; key: string; source: string } | null;
  channels?: OutputInfo[];
  outputs?: OutputInfo[];
};

export type OutputInfo = {
  code: string;
  name: string;
  title: string;
  blurb: string;
  status: string;
  enabled: boolean;
  registered: boolean;
};

export type ScanHint = {
  level?: "ok" | "warn" | string;
  summary?: string;
  codes?: string[];
  cortex_running?: boolean;
  tips?: string[];
};

export type ConnectedDevice = {
  id: string;
  kind: string;
  name?: string;
  address?: string;
  connected: boolean;
  locked?: boolean;
  detail?: string;
  battery?: number | null;
  sample_rate?: number;
  n_channels?: number;
  channels?: number | string[];
};

export type DevicesState = {
  primary?: string | null;
  primary_id?: string | null;
  connected?: ConnectedDevice[];
  kinds?: string[];
  scanned?: DevicePublic[];
  hint?: ScanHint;
};

export type DevicePublic = {
  id: string;
  kind: string;
  name?: string;
  address?: string;
  channels?: number | string[];
  n_channels?: number;
  connected?: boolean;
  locked?: boolean;
  detail?: string;
  battery?: number | null;
  sample_rate?: number;
};

export function getApp() {
  return req<AppState>("/app");
}

export function getDevices() {
  return req<DevicesState>("/devices");
}

export type PluginInfo = {
  id: string;
  title: string;
  dist: string;
  module: string;
  serve: string;
  default_port: number;
  endpoint: string;
  blurb: string;
  installed: boolean;
  loaded: boolean;
  local_path?: string | null;
  installable?: boolean;
};

export type PluginsState = {
  plugins: PluginInfo[];
  loaded: string[];
};

export function getPlugins() {
  return req<PluginsState>("/plugins");
}

export function installPlugin(id: string) {
  return req<PluginsState & { ok?: boolean; serve?: string; error?: string; stderr?: string }>(
    "/plugins/install",
    { method: "POST", body: JSON.stringify({ id }) },
  );
}

export function attachPlugin(id: string, endpoint?: string) {
  return req<PluginsState & { ok?: boolean; endpoint?: string }>(
    "/plugins/attach",
    {
      method: "POST",
      body: JSON.stringify(endpoint ? { id, endpoint } : { id }),
    },
  );
}

export function reloadPlugins() {
  return req<PluginsState>("/plugins/reload", {
    method: "POST",
    body: "{}",
  });
}

export function getOutputs() {
  return req<OutputsState>("/outputs");
}

export function connectWorker() {
  return req<void>("/connect", { method: "POST", body: "{}" });
}

export function stopWorker() {
  return req<void>("/stop", { method: "POST", body: "{}" });
}

export type Ads1299FrontEnd = {
  channels: number[];
  reference: "shared" | "differential";
  bias: boolean;
  gain: number;
};

export const DEFAULT_ADS1299_FRONTEND: Ads1299FrontEnd = {
  channels: [1, 2],
  reference: "shared",
  bias: true,
  gain: 1,
};

export function connectDevice(id: string, frontend?: Ads1299FrontEnd) {
  return req("/devices/connect", {
    method: "POST",
    body: JSON.stringify(frontend ? { id, frontend } : { id }),
  });
}

export function configureDevice(id: string, frontend: Ads1299FrontEnd) {
  return req<{ ok?: boolean; detail?: string; error?: string }>("/devices/configure", {
    method: "POST",
    body: JSON.stringify({ id, frontend }),
  });
}

export function setPrimaryDevice(id: string) {
  return req("/devices/primary", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export function disconnectDevice(id?: string) {
  return req("/devices/disconnect", {
    method: "POST",
    body: JSON.stringify(id ? { id } : {}),
  });
}

export function enableOutput(name: string) {
  return req<OutputsState>("/outputs/enable", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function disableOutput(name: string) {
  return req<OutputsState>("/outputs/disable", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function configureOutput(name: string, opts: Record<string, unknown>) {
  return req<OutputsState>("/outputs/configure", {
    method: "POST",
    body: JSON.stringify({ name, ...opts }),
  });
}

export function setKeysEnabled(enabled: boolean) {
  return req<void>("/keys", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export function getMontage() {
  return req<MontageState>("/montage");
}

export function setMontage(body: {
  action?: "set" | "reset";
  assignments?: (string | null)[];
  channels?: (string | null)[];
  reference?: string;
  closed?: number[];
}) {
  return req<MontageState>("/montage", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function selectProfile(id: string) {
  return req<AppState>("/profile/select", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export function createProfile(name: string) {
  return req<AppState>("/profile/create", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function deleteProfile(id: string) {
  return req<AppState>("/profile/delete", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export function startCalibrate() {
  return req<AppState>("/calibrate/start", { method: "POST", body: "{}" });
}

export function stopCalibrate() {
  return req<AppState>("/calibrate/stop", { method: "POST", body: "{}" });
}

export function startTrain(action: string) {
  return req<AppState>("/train/start", {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export function stopTrain() {
  return req<AppState>("/train/stop", { method: "POST", body: "{}" });
}

export function fitTrain() {
  return req<AppState>("/train/fit", { method: "POST", body: "{}" });
}

export function setMentalLive(enabled: boolean) {
  return req<AppState>("/mental/live", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export function updateControl(body: {
  keymap?: Record<string, string>;
  mental_threshold?: number;
  debounce_ms?: number;
}) {
  return req<AppState>("/control", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type BciEventHandler = (event: string, data: unknown) => void;

export function subscribeEvents(onEvent: BciEventHandler): () => void {
  const es = new EventSource(`${SSE_BASE}/events`);
  const kinds = [
    "status",
    "history",
    "app",
    "stats",
    "sample",
    "motion",
    "cq",
    "affect",
    "face",
    "command",
    "bands",
    "brain",
    "signal",
  ];
  for (const kind of kinds) {
    es.addEventListener(kind, (ev) => {
      const msg = ev as MessageEvent<string>;
      try {
        onEvent(kind, JSON.parse(msg.data));
      } catch {
        onEvent(kind, msg.data);
      }
    });
  }
  es.onerror = () => {
    onEvent("status", { text: "SSE disconnected", warn: true });
  };
  return () => es.close();
}

export async function probeApi(): Promise<boolean> {
  try {
    await getApp();
    return true;
  } catch {
    return false;
  }
}
