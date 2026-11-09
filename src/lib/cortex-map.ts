/** Band colors, 14-channel loci, and lobes for the live cortex view. */

export const VIZ_BANDS = [
  {
    key: "theta",
    label: "θ",
    name: "Theta",
    hz: "4–7.5 Hz",
    blurb: "ผ่อนคลาย · สร้างสรรค์ · ง่วงเบา",
    color: "#3d8bff",
    rgb: [0.24, 0.55, 1.0] as [number, number, number],
  },
  {
    key: "alpha",
    label: "α",
    name: "Alpha",
    hz: "8–11.5 Hz",
    blurb: "สงบ · ตื่นตัวเงียบ",
    color: "#7aa7ff",
    rgb: [0.48, 0.65, 1.0] as [number, number, number],
  },
  {
    key: "beta",
    label: "β",
    name: "Beta",
    hz: "12–24.5 Hz",
    blurb: "คิด · โฟกัส · ตื่นตัว",
    color: "#ff5ec8",
    rgb: [1.0, 0.28, 0.78] as [number, number, number],
  },
  {
    key: "gamma",
    label: "γ",
    name: "Gamma",
    hz: "25–45 Hz",
    blurb: "เรียนรู้ · จำ · แก้ปัญหา",
    color: "#ff4d5e",
    rgb: [1.0, 0.3, 0.37] as [number, number, number],
  },
] as const;

export type LobeId = "frontal" | "parietal" | "temporal" | "occipital";

export const LOBES: {
  id: LobeId;
  label: string;
  blurb: string;
}[] = [
  {
    id: "frontal",
    label: "Frontal",
    blurb: "ตัดสินใจ · วางแผน · แก้ปัญหา",
  },
  {
    id: "parietal",
    label: "Parietal",
    blurb: "รับรู้สัมผัส · ทิศทางในอวกาศ",
  },
  {
    id: "temporal",
    label: "Temporal",
    blurb: "ความจำ · ภาษา · การได้ยิน",
  },
  {
    id: "occipital",
    label: "Occipital",
    blurb: "การมองเห็น · แปลภาพ",
  },
];

/**
 * 14-channel 10–20 layout.
 * Order: AF3 F7 F3 FC5 T7 P7 O1 O2 P8 T8 FC6 F4 F8 AF4
 *
 * Fixed loci in anatomical unit space:
 * +X = subject right, +Y = up, +Z = nose (anterior).
 * `xyz` is on the unit scalp ellipsoid before radius scale.
 */
export const EPOC_SENSORS: {
  name: string;
  lobe: LobeId;
  hemi: -1 | 1;
  /** Unit scalp position (right, up, anterior). */
  xyz: [number, number, number];
  /** Thai scalp location. */
  siteTh: string;
}[] = [
  {
    name: "AF3",
    lobe: "frontal",
    hemi: -1,
    xyz: [-0.28, 0.58, 0.78],
    siteTh: "หน้าผากด้านซ้าย",
  },
  {
    name: "F7",
    lobe: "frontal",
    hemi: -1,
    xyz: [-0.72, 0.22, 0.48],
    siteTh: "หน้าผากด้านข้างซ้าย",
  },
  {
    name: "F3",
    lobe: "frontal",
    hemi: -1,
    xyz: [-0.38, 0.48, 0.62],
    siteTh: "สมองส่วนหน้าซ้าย",
  },
  {
    name: "FC5",
    lobe: "frontal",
    hemi: -1,
    xyz: [-0.58, 0.18, 0.32],
    siteTh: "ระหว่างส่วนหน้าและส่วนกลางซ้าย",
  },
  {
    name: "T7",
    lobe: "temporal",
    hemi: -1,
    xyz: [-0.88, 0.02, 0.02],
    siteTh: "ขมับซ้าย เหนือหู",
  },
  {
    name: "P7",
    lobe: "parietal",
    hemi: -1,
    xyz: [-0.58, -0.02, -0.52],
    siteTh: "ด้านหลังศีรษะฝั่งซ้าย",
  },
  {
    name: "O1",
    lobe: "occipital",
    hemi: -1,
    xyz: [-0.22, -0.12, -0.82],
    siteTh: "ท้ายทอยซ้าย",
  },
  {
    name: "O2",
    lobe: "occipital",
    hemi: 1,
    xyz: [0.22, -0.12, -0.82],
    siteTh: "ท้ายทอยขวา",
  },
  {
    name: "P8",
    lobe: "parietal",
    hemi: 1,
    xyz: [0.58, -0.02, -0.52],
    siteTh: "ด้านหลังศีรษะฝั่งขวา",
  },
  {
    name: "T8",
    lobe: "temporal",
    hemi: 1,
    xyz: [0.88, 0.02, 0.02],
    siteTh: "ขมับขวา เหนือหู",
  },
  {
    name: "FC6",
    lobe: "frontal",
    hemi: 1,
    xyz: [0.58, 0.18, 0.32],
    siteTh: "ระหว่างส่วนหน้าและส่วนกลางขวา",
  },
  {
    name: "F4",
    lobe: "frontal",
    hemi: 1,
    xyz: [0.38, 0.48, 0.62],
    siteTh: "สมองส่วนหน้าขวา",
  },
  {
    name: "F8",
    lobe: "frontal",
    hemi: 1,
    xyz: [0.72, 0.22, 0.48],
    siteTh: "หน้าผากด้านข้างขวา",
  },
  {
    name: "AF4",
    lobe: "frontal",
    hemi: 1,
    xyz: [0.28, 0.58, 0.78],
    siteTh: "หน้าผากด้านขวา",
  },
];

export const CHANNEL_SITE_TH: Record<string, string> = {
  ...Object.fromEntries(EPOC_SENSORS.map((s) => [s.name, s.siteTh])),
  Fpz: "หน้าผากกึ่งกลาง",
};

export function siteThFor(channel: string): string {
  return CHANNEL_SITE_TH[channel] || "";
}

/** Map pipeline 5-band means onto θ α β γ. */
export function toBandShares(raw: number[] | null | undefined): number[] {
  const b = raw || [];
  const theta = Number(b[0]) || 0;
  const alpha = Number(b[1]) || 0;
  const beta = ((Number(b[2]) || 0) + (Number(b[3]) || 0)) * 0.5;
  const gamma = Number(b[4]) || 0;
  return [theta, alpha, beta, gamma].map((v) =>
    Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0)),
  );
}

/** Normalize 14×4 channel band matrix. */
export function normalizeChannelBands(raw: unknown): number[][] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out: number[][] = [];
  for (const row of raw) {
    if (!Array.isArray(row)) continue;
    const vals = row.slice(0, 4).map((v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
    });
    while (vals.length < 4) vals.push(0);
    out.push(vals);
  }
  return out.length ? out : null;
}

export function meanCq(cq: (number | null)[] | undefined): number | null {
  const vals = (cq || [])
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
