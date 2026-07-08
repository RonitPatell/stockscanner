/** Intraday relative volume using time-of-day session progress (US market). */
export function getSessionVolumeFactor(): number {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  if (day === 0 || day === 6) return 0.35;
  const mins = et.getHours() * 60 + et.getMinutes();
  if (mins >= 240 && mins < 570) return 0.15;
  if (mins >= 960 && mins < 1200) return 0.1;
  if (mins < 570 || mins >= 960) return 0.35;
  const sessionStart = 9 * 60 + 30;
  const sessionEnd = 16 * 60;
  const elapsed = Math.max(15, mins - sessionStart);
  const total = sessionEnd - sessionStart;
  return Math.min(0.95, Math.max(0.2, elapsed / total));
}

export function computeRvol(
  volume: number | null | undefined,
  avgVolume: number | null | undefined
): number | null {
  if (volume == null || avgVolume == null || volume <= 0 || avgVolume <= 0) return null;
  const expected = avgVolume * getSessionVolumeFactor();
  if (expected <= 0) return null;
  return Math.round((volume / expected) * 10) / 10;
}

export function formatRvol(rvol: number | null | undefined): string {
  if (rvol == null) return "—";
  return `${rvol.toFixed(1)}×`;
}

export function formatVolumeShort(n: number | null | undefined): string {
  if (n == null || n <= 0) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toLocaleString();
}
