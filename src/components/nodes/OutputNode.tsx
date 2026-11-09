"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { OutputNodeData } from "@/lib/flow-schema";

export function OutputNode({ data, selected }: NodeProps) {
  const d = data as OutputNodeData;
  return (
    <div className={`sb-node sb-node-output ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Left} id="in" />
      <div className="sb-node-kicker">03 · Output</div>
      <div className="sb-node-title">{d.label}</div>
      <div className="sb-node-meta">{d.kind}</div>
    </div>
  );
}
