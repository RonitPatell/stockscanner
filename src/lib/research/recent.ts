/**
 * Research recently-viewed tickers (client localStorage).
 */

const STORAGE_KEY = "tt-research-recent-v1";
const MAX = 12;

export function loadResearchRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s) => String(s).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5))
      .filter((s) => s.length >= 1)
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushResearchRecent(symbol: string): string[] {
  const sym = symbol.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  if (!sym) return loadResearchRecent();
  const next = [sym, ...loadResearchRecent().filter((s) => s !== sym)].slice(
    0,
    MAX
  );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function researchRecentStorageKey(): string {
  return STORAGE_KEY;
}
