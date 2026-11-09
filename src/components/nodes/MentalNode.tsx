"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { MentalNodeData } from "@/lib/flow-schema";

export function MentalNode({ data, selected }: NodeProps) {
  const d = data as MentalNodeData;
  return (
    <div className={`sb-node sb-node-mental ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Left} id="in" />
      <div className="sb-node-kicker">02 · Mental</div>
      <div className="sb-node-title">{d.label}</div>
      <div className="sb-node-meta">
        {d.profileId ? `profile ${d.profileId}` : "calibrate · train · live"}
      </div>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}
