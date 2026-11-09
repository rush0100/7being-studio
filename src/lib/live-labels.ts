/** Labels matching the Python live SSE pipeline. */

/** Flatten channel×band matrices into one 0–1 share per band. */
export function normalizeBands(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  if (Array.isArray(raw[0])) {
    const rows = raw as unknown[][];
    const width = Math.max(
      ...rows.map((r) => (Array.isArray(r) ? r.length : 0)),
    );
    if (!width) return null;
    const out: number[] = [];
    for (let b = 0; b < width; b++) {
      let sum = 0;
      let n = 0;
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        const v = Number(row[b]);
        if (!Number.isFinite(v)) continue;
        sum += v;
        n += 1;
      }
      out.push(n ? sum / n : 0);
    }
    return out;
  }
  return raw.map((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  });
}

export const AFFECT_NAMES = [
  "Excitement",
  "Engagement",
  "Relaxation",
  "Stress",
  "Interest",
  "Focus",
] as const;

export const FACE_NAMES = [
  "Blink",
  "Wink L",
  "Wink R",
  "Look L",
  "Look R",
] as const;

export const BAND_NAMES = [
  "theta",
  "alpha",
  "lowBeta",
  "highBeta",
  "gamma",
] as const;

export const DEFAULT_CH = [
  "AF3",
  "F7",
  "F3",
  "FC5",
  "T7",
  "P7",
  "O1",
  "O2",
  "P8",
  "T8",
  "FC6",
  "F4",
  "F8",
  "AF4",
] as const;
