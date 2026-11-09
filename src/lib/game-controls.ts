/** Map BCI commands / keys → open-world movement. */

export type MoveAction = "forward" | "back" | "left" | "right" | "jump" | "idle";

const COMMAND_MAP: Record<string, MoveAction> = {
  push: "forward",
  forward: "forward",
  เดินหน้า: "forward",
  pull: "back",
  back: "back",
  backward: "back",
  ถอย: "back",
  ถอยหลัง: "back",
  left: "left",
  "look l": "left",
  ซ้าย: "left",
  right: "right",
  "look r": "right",
  ขวา: "right",
  lift: "jump",
  jump: "jump",
  blink: "jump",
  "wink l": "jump",
  "wink r": "jump",
  กระโดด: "jump",
  neutral: "idle",
  drop: "idle",
};

const KEY_MAP: Record<string, MoveAction> = {
  w: "forward",
  arrowup: "forward",
  s: "back",
  arrowdown: "back",
  a: "left",
  arrowleft: "left",
  d: "right",
  arrowright: "right",
  " ": "jump",
  space: "jump",
  q: "jump",
  e: "jump",
};

export function actionFromCommand(name: string | null | undefined): MoveAction {
  if (!name) return "idle";
  return COMMAND_MAP[name.trim().toLowerCase()] || "idle";
}

export function actionFromKey(key: string): MoveAction | null {
  return KEY_MAP[key.toLowerCase()] || null;
}

export type HeldMoves = Record<Exclude<MoveAction, "idle" | "jump">, boolean> & {
  jumpQueued: boolean;
};

export function emptyHeld(): HeldMoves {
  return {
    forward: false,
    back: false,
    left: false,
    right: false,
    jumpQueued: false,
  };
}
