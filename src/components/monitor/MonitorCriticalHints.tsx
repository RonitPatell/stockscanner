/**
 * First-party preconnect / preload hints for Monitor first paint.
 * Never lists market-data provider hosts or credentials.
 */

import { monitorRouteHref } from "@/lib/monitor/route";

function firstPartyOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Server component: emit preconnect for the app origin when configured,
 * plus a low-priority prefetch of the Monitor document for entitled layouts.
 * Snapshot polling is intentionally omitted.
 */
export function MonitorCriticalHints({
  entitled,
}: {
  /** Only emit route prefetch hint when the user may open Monitor. */
  entitled: boolean;
}) {
  const origin = firstPartyOrigin();
  const monitorHref = monitorRouteHref();

  return (
    <>
      {origin ? (
        <>
          <link rel="preconnect" href={origin} />
          <link rel="dns-prefetch" href={origin} />
        </>
      ) : null}
      {/* Essential brand mark used in Monitor status chrome */}
      <link rel="preload" href="/icon.svg" as="image" type="image/svg+xml" />
      {entitled ? (
        <link rel="prefetch" href={monitorHref} as="document" />
      ) : null}
    </>
  );
}
