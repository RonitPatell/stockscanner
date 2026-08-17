/**
 * Client last-view helpers for company What Changed.
 */

export function tickerLastViewStorageKey(symbol: string): string {
  return `tt-ticker-last-view:${symbol.trim().toUpperCase()}`;
}

export function loadTickerLastView(symbol: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(tickerLastViewStorageKey(symbol));
  } catch {
    return null;
  }
}

export function saveTickerLastView(
  symbol: string,
  iso = new Date().toISOString()
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(tickerLastViewStorageKey(symbol), iso);
  } catch {
    /* ignore */
  }
}
