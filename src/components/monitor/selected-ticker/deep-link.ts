/** Monitor deep-link helpers — symbol query only (no private state). */

export const MONITOR_SYMBOL_PARAM = "symbol";

export function symbolFromSearchParams(
  params: URLSearchParams
): string | null {
  const raw =
    params.get(MONITOR_SYMBOL_PARAM) ||
    params.get("ticker") ||
    params.get("sym");
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(s) ? s : null;
}

export function writeMonitorSymbolDeepLink(symbol: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const next = symbol ? symbol.toUpperCase() : "";
    const cur = url.searchParams.get(MONITOR_SYMBOL_PARAM) ?? "";
    // Avoid replaceState when unchanged — App Router remounts have caused update loops.
    if (next === cur) return;
    if (next) {
      url.searchParams.set(MONITOR_SYMBOL_PARAM, next);
    } else {
      url.searchParams.delete(MONITOR_SYMBOL_PARAM);
    }
    url.searchParams.delete("ticker");
    url.searchParams.delete("sym");
    window.history.replaceState({}, "", url.toString());
  } catch {
    /* ignore */
  }
}

export function clearMonitorSymbolDeepLink(): void {
  writeMonitorSymbolDeepLink(null);
}
