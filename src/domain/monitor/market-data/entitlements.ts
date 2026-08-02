import type {
  MarketDataPlanEntitlements,
  NormalizedMarketEvent,
  SubscribeRequest,
} from "./types.ts";

export class EntitlementError extends Error {
  code:
    | "channel_not_entitled"
    | "symbol_limit"
    | "realtime_forbidden"
    | "nbbo_forbidden";

  constructor(
    message: string,
    code:
      | "channel_not_entitled"
      | "symbol_limit"
      | "realtime_forbidden"
      | "nbbo_forbidden"
  ) {
    super(message);
    this.name = "EntitlementError";
    this.code = code;
  }
}

/** Default conservative plan — delayed aggregates only. */
export function conservativePlanEntitlements(): MarketDataPlanEntitlements {
  return {
    realtimeTrades: false,
    realtimeNbbo: false,
    delayedOk: true,
    aggregates: true,
    luld: false,
    haltStatus: true,
    maxSymbols: 25,
    delayMsWhenDelayed: 15 * 60_000,
  };
}

export function assertSubscribeAllowed(req: SubscribeRequest): void {
  const { entitlements: e, symbols, channels } = req;
  if (symbols.length > e.maxSymbols) {
    throw new EntitlementError(
      `symbol_limit:${symbols.length}>${e.maxSymbols}`,
      "symbol_limit"
    );
  }
  for (const ch of channels) {
    if (ch === "trades" && !e.realtimeTrades && !e.delayedOk) {
      throw new EntitlementError("trades_not_entitled", "channel_not_entitled");
    }
    if (ch === "nbbo" && !e.realtimeNbbo && !e.delayedOk) {
      throw new EntitlementError("nbbo_not_entitled", "nbbo_forbidden");
    }
    if (ch === "nbbo" && e.realtimeNbbo === false && !e.delayedOk) {
      throw new EntitlementError("nbbo_forbidden", "nbbo_forbidden");
    }
    if (
      (ch === "aggregate_1s" || ch === "aggregate_1m") &&
      !e.aggregates
    ) {
      throw new EntitlementError(
        "aggregates_not_entitled",
        "channel_not_entitled"
      );
    }
    if (ch === "luld" && !e.luld) {
      throw new EntitlementError("luld_not_entitled", "channel_not_entitled");
    }
    if (ch === "halt" && !e.haltStatus) {
      throw new EntitlementError("halt_not_entitled", "channel_not_entitled");
    }
  }
  if (
    channels.includes("trades") &&
    e.realtimeTrades === false &&
    e.delayedOk === false
  ) {
    throw new EntitlementError("realtime_forbidden", "realtime_forbidden");
  }
}

/**
 * Drop or rewrite events that exceed plan entitlements.
 * Realtime events on delayed-only plans become delayed with delayMs stamped.
 */
export function applyEntitlementsToEvent(
  event: NormalizedMarketEvent,
  plan: MarketDataPlanEntitlements
): NormalizedMarketEvent | null {
  if (event.type === "connection_health") return event;

  if (event.type === "nbbo_quote" && !plan.realtimeNbbo && !plan.delayedOk) {
    return null;
  }
  if (event.type === "trade" && !plan.realtimeTrades && !plan.delayedOk) {
    return null;
  }
  if (
    (event.type === "aggregate_1s" || event.type === "aggregate_1m") &&
    !plan.aggregates
  ) {
    return null;
  }
  if (event.type === "luld" && !plan.luld) return null;
  if (event.type === "halt" && !plan.haltStatus) return null;

  const needsDelayStamp =
    event.dataEntitlement === "realtime" &&
    ((event.type === "trade" && !plan.realtimeTrades) ||
      (event.type === "nbbo_quote" && !plan.realtimeNbbo));

  if (needsDelayStamp && plan.delayedOk) {
    return {
      ...event,
      dataEntitlement: "delayed",
      delayedByMs:
        event.delayedByMs ?? plan.delayMsWhenDelayed ?? 15 * 60_000,
    };
  }

  if (
    event.dataEntitlement === "realtime" &&
    !plan.realtimeTrades &&
    !plan.realtimeNbbo &&
    !plan.delayedOk
  ) {
    return null;
  }

  return event;
}
