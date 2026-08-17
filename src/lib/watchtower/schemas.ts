/**
 * Zod schemas for Watchtower APIs.
 * Never accept client-supplied userId.
 */

import { z } from "zod";
import {
  COMPANY_EVENT_CATEGORIES,
  COMPANY_EVENT_SEVERITIES,
} from "../company-events/types.ts";
import { SIGNIFICANCE_LEVELS } from "../company-events/significance.ts";
import { normalizePortfolioSymbol } from "../portfolio/symbols.ts";

const csvOrArray = <T extends string>(allowed: readonly T[]) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((raw, ctx) => {
      if (raw == null || raw === "") return undefined;
      const parts = Array.isArray(raw)
        ? raw
        : raw.split(",").map((s) => s.trim()).filter(Boolean);
      const out: T[] = [];
      const allow = new Set<string>(allowed);
      for (const p of parts) {
        if (!allow.has(p)) {
          ctx.addIssue({
            code: "custom",
            message: `Invalid value: ${p}`,
          });
          return z.NEVER;
        }
        out.push(p as T);
      }
      return out.length ? out : undefined;
    });

const isoDateOptional = z
  .string()
  .max(40)
  .optional()
  .transform((v, ctx) => {
    if (v == null || v.trim() === "") return undefined;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
      return z.NEVER;
    }
    return d;
  });

const boolish = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .optional()
  .transform((v) => {
    if (v == null) return undefined;
    if (typeof v === "boolean") return v;
    return v === "true" || v === "1";
  });

const symbolFilter = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((raw, ctx) => {
    if (raw == null || raw === "") return undefined;
    const parts = Array.isArray(raw)
      ? raw
      : raw.split(",").map((s) => s.trim()).filter(Boolean);
    const out: string[] = [];
    for (const p of parts) {
      const sym = normalizePortfolioSymbol(p);
      if (!sym) {
        ctx.addIssue({ code: "custom", message: `Invalid symbol: ${p}` });
        return z.NEVER;
      }
      out.push(sym);
    }
    return out.length ? [...new Set(out)] : undefined;
  });

/** GET /api/watchtower query params. */
export const watchtowerFeedQuerySchema = z
  .object({
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    /** Filter occurredAt >= since */
    since: isoDateOptional,
    /** Filter occurredAt <= until */
    until: isoDateOptional,
    category: csvOrArray(COMPANY_EVENT_CATEGORIES),
    /** Legacy severity column values. */
    severity: csvOrArray(COMPANY_EVENT_SEVERITIES),
    /** Significance levels — mapped to legacy severity for efficient filtering. */
    significance: csvOrArray(SIGNIFICANCE_LEVELS),
    symbol: symbolFilter,
    includeDismissed: boolish,
    unreadOnly: boolish,
  })
  .strict();

export type WatchtowerFeedQuery = z.infer<typeof watchtowerFeedQuerySchema>;

/** PATCH /api/watchtower/events/[id] — mark read / dismiss / restore. */
export const watchtowerEventStateBodySchema = z
  .object({
    read: z.boolean().optional(),
    dismissed: z.boolean().optional(),
    opened: z.boolean().optional(),
  })
  .strict()
  .refine(
    (b) =>
      b.read !== undefined ||
      b.dismissed !== undefined ||
      b.opened === true,
    {
      message: "Provide read, dismissed, and/or opened",
    }
  );

export type WatchtowerEventStateBody = z.infer<
  typeof watchtowerEventStateBodySchema
>;

/** POST /api/watchtower/events/state — batch mark read (ids only). */
export const watchtowerBatchStateBodySchema = z
  .object({
    eventIds: z
      .array(z.string().min(1).max(64))
      .min(1)
      .max(100),
    read: z.boolean().optional(),
    dismissed: z.boolean().optional(),
  })
  .strict()
  .refine((b) => b.read !== undefined || b.dismissed !== undefined, {
    message: "Provide read and/or dismissed",
  });

export type WatchtowerBatchStateBody = z.infer<
  typeof watchtowerBatchStateBodySchema
>;

export function zodErrorMessage(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid request";
}
