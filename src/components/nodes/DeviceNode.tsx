"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DeviceNodeData } from "@/lib/flow-schema";

export function DeviceNode({ data, selected }: NodeProps) {
  const d = data as DeviceNodeData;
  return (
    <div className={`sb-node sb-node-device ${selected ? "selected" : ""}`}>
      <div className="sb-node-kicker">01 · Device</div>
      <div className="sb-node-title">{d.label}</div>
      <div className="sb-node-meta">
        {d.deviceName || d.deviceId
          ? `${d.deviceName || d.deviceId}${d.nChannels ? ` · ${d.nChannels}ch` : ""}`
          : "สแกน → เลือกเครื่อง"}
      </div>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}
