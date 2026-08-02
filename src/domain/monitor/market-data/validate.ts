import { marketEventSchema } from "./schemas.ts";
import type { NormalizedMarketEvent, ValidationResult } from "./types.ts";
import { MONITOR_MARKET_DATA_VERSION } from "./version.ts";

const MAX_CLOCK_SKEW_MS = 5 * 60_000;

export interface ValidateOptions {
  /** Wall clock for skew checks (inject in tests). */
  nowMs?: number;
  maxClockSkewMs?: number;
}

function zodErrors(err: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string[] {
  return err.issues.map((i) => {
    const path = i.path.length ? i.path.join(".") : "root";
    return `${path}:${i.message}`;
  });
}

function eventTimeMs(event: NormalizedMarketEvent): number | null {
  switch (event.type) {
    case "trade":
      return Date.parse(event.sipTimestamp);
    case "nbbo_quote":
      return Date.parse(event.sipTimestamp);
    case "aggregate_1s":
    case "aggregate_1m":
      return Date.parse(event.windowEnd);
    case "luld":
    case "halt":
    case "symbol_status":
      return Date.parse(event.eventAt);
    case "connection_health":
      return Date.parse(event.trustTickerReceivedAt);
    default:
      return null;
  }
}

/**
 * Runtime-validate a candidate market event.
 * Rejects malformed prices, sizes, timestamps; flags provider clock skew.
 */
export function validateMarketEvent(
  raw: unknown,
  opts: ValidateOptions = {}
): ValidationResult {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, errors: ["root:not_an_object"] };
  }

  const candidate = { ...(raw as Record<string, unknown>) };
  if (candidate.schemaVersion == null) {
    candidate.schemaVersion = MONITOR_MARKET_DATA_VERSION;
  }

  const parsed = marketEventSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      errors: zodErrors(parsed.error),
      rawType:
        typeof candidate.type === "string" ? candidate.type : undefined,
    };
  }

  const event = parsed.data as NormalizedMarketEvent;
  const now = opts.nowMs ?? Date.now();
  const skewLimit = opts.maxClockSkewMs ?? MAX_CLOCK_SKEW_MS;
  const t = eventTimeMs(event);
  if (t != null && Number.isFinite(t)) {
    if (t - now > skewLimit) {
      return {
        ok: false,
        errors: [`timestamp:provider_clock_skew_future_${t - now}ms`],
        rawType: event.type,
      };
    }
  }

  const recv = Date.parse(event.providerReceivedAt);
  const tt = Date.parse(event.trustTickerReceivedAt);
  if (Number.isFinite(recv) && Number.isFinite(tt) && tt + 1 < recv) {
    // Allow 1ms float; otherwise providerReceivedAt after trustTickerReceivedAt is suspicious
    return {
      ok: false,
      errors: ["timestamp:trustTickerReceivedAt_before_providerReceivedAt"],
      rawType: event.type,
    };
  }

  return { ok: true, event };
}

export function isDelayedEntitlement(
  event: Pick<NormalizedMarketEvent, "dataEntitlement" | "delayedByMs">
): boolean {
  if (event.dataEntitlement === "delayed") return true;
  return event.delayedByMs != null && event.delayedByMs > 0;
}
