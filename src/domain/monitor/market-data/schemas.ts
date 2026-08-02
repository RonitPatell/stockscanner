import { z } from "zod";
import { MONITOR_MARKET_DATA_VERSION } from "./version.ts";

const isoTimestamp = z
  .string()
  .min(1)
  .refine((v) => Number.isFinite(Date.parse(v)), {
    message: "invalid_iso_timestamp",
  });

const positivePrice = z
  .number()
  .finite()
  .gt(0, { message: "price_must_be_positive" });

const nonNegSize = z
  .number()
  .finite()
  .gte(0, { message: "size_must_be_non_negative" });

const symbolSchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9.-]{0,9}$/, { message: "invalid_symbol" });

const baseFields = {
  schemaVersion: z.literal(MONITOR_MARKET_DATA_VERSION),
  symbol: symbolSchema,
  provider: z.string().min(1),
  sequenceNumber: z.number().int().gte(0),
  providerReceivedAt: isoTimestamp,
  trustTickerReceivedAt: isoTimestamp,
  dataEntitlement: z.enum([
    "realtime",
    "delayed",
    "nbbo",
    "trades_only",
    "aggregates_only",
    "status_only",
    "none",
  ]),
  delayedByMs: z.number().finite().gte(0).nullable().optional(),
};

export const tradeSchema = z
  .object({
    ...baseFields,
    type: z.literal("trade"),
    price: positivePrice,
    size: nonNegSize,
    exchange: z.string().min(1),
    conditions: z.array(z.string()),
    participantTimestamp: isoTimestamp,
    sipTimestamp: isoTimestamp,
    tape: z.enum(["A", "B", "C", "unknown"]),
  })
  .strict();

export const nbboQuoteSchema = z
  .object({
    ...baseFields,
    type: z.literal("nbbo_quote"),
    bidPrice: positivePrice,
    bidSize: nonNegSize,
    askPrice: positivePrice,
    askSize: nonNegSize,
    bidExchange: z.string().min(1),
    askExchange: z.string().min(1),
    sipTimestamp: isoTimestamp,
    quoteQuality: z.enum([
      "nbbo",
      "bbo",
      "last_sale_derived",
      "indicative",
      "stale",
      "unknown",
    ]),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (q.askPrice < q.bidPrice) {
      ctx.addIssue({
        code: "custom",
        message: "ask_below_bid",
        path: ["askPrice"],
      });
    }
  });

const aggregateBody = {
  ...baseFields,
  open: positivePrice,
  high: positivePrice,
  low: positivePrice,
  close: positivePrice,
  volume: nonNegSize,
  vwap: positivePrice.nullable().optional(),
  tradeCount: z.number().int().gte(0).nullable().optional(),
  windowStart: isoTimestamp,
  windowEnd: isoTimestamp,
};

export const aggregate1sSchema = z
  .object({ ...aggregateBody, type: z.literal("aggregate_1s") })
  .strict()
  .superRefine(refineAggregate);

export const aggregate1mSchema = z
  .object({ ...aggregateBody, type: z.literal("aggregate_1m") })
  .strict()
  .superRefine(refineAggregate);

function refineAggregate(
  a: {
    open: number;
    high: number;
    low: number;
    close: number;
    windowStart: string;
    windowEnd: string;
  },
  ctx: z.RefinementCtx
): void {
  if (a.high < a.low) {
    ctx.addIssue({ code: "custom", message: "high_below_low", path: ["high"] });
  }
  if (a.high < a.open || a.high < a.close) {
    ctx.addIssue({ code: "custom", message: "high_inconsistent", path: ["high"] });
  }
  if (a.low > a.open || a.low > a.close) {
    ctx.addIssue({ code: "custom", message: "low_inconsistent", path: ["low"] });
  }
  if (Date.parse(a.windowEnd) < Date.parse(a.windowStart)) {
    ctx.addIssue({
      code: "custom",
      message: "window_end_before_start",
      path: ["windowEnd"],
    });
  }
}

export const luldSchema = z
  .object({
    ...baseFields,
    type: z.literal("luld"),
    status: z.enum([
      "limit_state",
      "straddle_state",
      "cleared",
      "unknown",
    ]),
    bandSide: z.enum(["upper", "lower", "both", "unknown"]),
    upperPrice: positivePrice.nullable().optional(),
    lowerPrice: positivePrice.nullable().optional(),
    eventAt: isoTimestamp,
    exchange: z.string().nullable().optional(),
  })
  .strict();

export const haltSchema = z
  .object({
    ...baseFields,
    type: z.literal("halt"),
    lifecycle: z.enum([
      "halted",
      "news_disseminated",
      "resumption_quote_scheduled",
      "resumed",
      "unknown",
    ]),
    haltCode: z.string().min(1),
    exchange: z.string().nullable().optional(),
    eventAt: isoTimestamp,
    officialResumptionQuoteAt: isoTimestamp.nullable().optional(),
    officialResumptionTradeAt: isoTimestamp.nullable().optional(),
  })
  .strict();

export const symbolStatusSchema = z
  .object({
    ...baseFields,
    type: z.literal("symbol_status"),
    status: z.enum(["trading", "halted", "paused", "closed", "unknown"]),
    eventAt: isoTimestamp,
    detail: z.string().nullable().optional(),
  })
  .strict();

export const connectionHealthSchema = z
  .object({
    ...baseFields,
    type: z.literal("connection_health"),
    symbol: z.union([symbolSchema, z.literal("*")]),
    state: z.enum([
      "connecting",
      "connected",
      "reconnecting",
      "disconnected",
      "failed",
      "backfilling",
    ]),
    attempt: z.number().int().gte(0).nullable().optional(),
    nextRetryMs: z.number().finite().gte(0).nullable().optional(),
    lastError: z.string().nullable().optional(),
    subscribedSymbols: z.array(z.string()).optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

export const marketEventSchema = z.discriminatedUnion("type", [
  tradeSchema,
  nbboQuoteSchema,
  aggregate1sSchema,
  aggregate1mSchema,
  luldSchema,
  haltSchema,
  symbolStatusSchema,
  connectionHealthSchema,
]);
