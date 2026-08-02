/**
 * Robust statistics — median / MAD / winsorize / bounded transforms.
 * Pure and deterministic. Prevents one extreme print from dominating.
 */

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) return s[mid]!;
  return (s[mid - 1]! + s[mid]!) / 2;
}

/** Median absolute deviation. */
export function mad(values: number[], med?: number | null): number | null {
  if (values.length === 0) return null;
  const m = med ?? median(values);
  if (m == null) return null;
  const abs = values.map((v) => Math.abs(v - m));
  return median(abs);
}

/**
 * Robust z-score: (x - median) / (c * MAD).
 * c = 1.4826 ≈ consistency with σ for normal data.
 * Returns null when scale is degenerate.
 */
export function robustZ(
  x: number,
  values: number[],
  opts?: { minMad?: number; consistency?: number }
): number | null {
  if (values.length < 3) return null;
  const med = median(values);
  if (med == null) return null;
  const m = mad(values, med);
  const c = opts?.consistency ?? 1.4826;
  const minMad = opts?.minMad ?? 1e-12;
  const scale = Math.max(minMad, (m ?? 0) * c);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  return (x - med) / scale;
}

/** Clip to [lo, hi]. */
export function winsorize(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

/** Bound |z| so a single outlier cannot produce a max component. */
export function capAbs(z: number, maxAbs: number): number {
  return winsorize(z, -maxAbs, maxAbs);
}

/**
 * Map capped |z| → [0, 100] with soft saturation.
 * At zCap → ~100; linear below for explainability.
 */
export function intensityFromAbsZ(z: number, zCap: number): number {
  const a = Math.abs(z);
  if (zCap <= 0) return 0;
  const t = Math.min(1, a / zCap);
  // Mild concave easing so mid-range is readable; still deterministic.
  return round1(100 * Math.sqrt(t));
}

export function signedIntensityFromZ(z: number, zCap: number): number {
  const mag = intensityFromAbsZ(z, zCap);
  if (z > 0) return mag;
  if (z < 0) return -mag;
  return 0;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Clamp intensity to [0, 100]. */
export function clamp01to100(n: number): number {
  return winsorize(n, 0, 100);
}
