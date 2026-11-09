import type { WebGLRenderer } from "three";

export type BrainUpdate = {
  bands?: string[];
  channels?: { name: string; share: number[]; color?: string }[];
  lobes?: { name: string; share: number[]; color?: string }[];
};

export declare class Brain3D {
  constructor(canvas: HTMLCanvasElement);
  renderer: WebGLRenderer;
  update(data: BrainUpdate): void;
  setView(mode: "front" | "top" | "side" | "free"): void;
  resize(): void;
  destroy(): void;
}

export declare const BRAIN3D_PARTS: unknown[];
export declare const BRAIN3D_BANDS: string[];
export default Brain3D;
