/**
 * Zod schemas for monitored portfolio APIs.
 * Never accept client-supplied userId.
 */

import { z } from "zod";
import { normalizePortfolioSymbol } from "./symbols.ts";

export const portfolioSymbolSchema = z
  .string()
  .trim()
  .min(1, "Ticker is required")
  .max(8, "Ticker is too long")
  .transform((raw, ctx) => {
    const symbol = normalizePortfolioSymbol(raw);
    if (!symbol) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid ticker symbol",
      });
      return z.NEVER;
    }
    return symbol;
  });

const optionalLabel = z
  .string()
  .trim()
  .max(80, "Label is too long")
  .optional()
  .nullable();

const optionalNote = z
  .string()
  .trim()
  .max(500, "Note is too long")
  .optional()
  .nullable();

const optionalEntryPrice = z
  .number()
  .finite()
  .gt(0, "Entry price must be positive")
  .max(1_000_000, "Entry price is too large")
  .optional()
  .nullable();

const optionalMonitoredSince = z
  .string()
  .max(40)
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v == null || v.trim() === "") return undefined;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid monitoredSince date" });
      return z.NEVER;
    }
    return d;
  });

/** POST /api/portfolio — add monitored company. */
export const addPortfolioBodySchema = z
  .object({
    symbol: portfolioSymbolSchema,
    label: optionalLabel,
    note: optionalNote,
    notes: optionalNote,
    entryPrice: optionalEntryPrice,
    monitoredSince: optionalMonitoredSince,
    kind: z.enum(["watch", "holding", "both"]).optional(),
  })
  .strict();

/** PATCH /api/portfolio/[id] */
export const updatePortfolioBodySchema = z
  .object({
    label: optionalLabel,
    note: optionalNote,
    notes: optionalNote,
    entryPrice: optionalEntryPrice,
    monitoredSince: optionalMonitoredSince,
    kind: z.enum(["watch", "holding", "both"]).optional(),
  })
  .strict();

export const portfolioSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(40),
  limit: z.coerce.number().int().min(1).max(25).optional().default(12),
});

export type AddPortfolioBody = {
  symbol: string;
  label?: string | null;
  note?: string | null;
  notes?: string | null;
  entryPrice?: number | null;
  monitoredSince?: Date | null;
  kind?: "watch" | "holding" | "both";
};

export type UpdatePortfolioBody = {
  label?: string | null;
  note?: string | null;
  notes?: string | null;
  entryPrice?: number | null;
  monitoredSince?: Date | null;
  kind?: "watch" | "holding" | "both";
};
export function zodErrorMessage(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid request";
}
