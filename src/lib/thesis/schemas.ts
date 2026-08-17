/**
 * Zod schemas for Thesis Monitoring APIs.
 * Never accept client-supplied userId. No executable formulas.
 */

import { z } from "zod";
import { isCompanyEventType } from "../company-events/types.ts";
import { normalizePortfolioSymbol } from "../portfolio/symbols.ts";
import {
  CAPITAL_RISK_STATUS_LEVELS,
  GROWTH_PERIODS,
  THESIS_CONDITION_POLARITIES,
  THESIS_CONDITION_TYPES,
  THESIS_METRIC_KEYS,
  THESIS_STATUSES,
} from "./types.ts";

export const thesisSymbolSchema = z
  .string()
  .trim()
  .min(1, "Ticker is required")
  .max(8, "Ticker is too long")
  .transform((raw, ctx) => {
    const symbol = normalizePortfolioSymbol(raw);
    if (!symbol) {
      ctx.addIssue({ code: "custom", message: "Invalid ticker symbol" });
      return z.NEVER;
    }
    return symbol;
  });

const optionalTitle = z
  .string()
  .trim()
  .max(120, "Title is too long")
  .optional()
  .nullable();

const optionalNote = z
  .string()
  .trim()
  .max(4000, "Note is too long")
  .optional()
  .nullable();

const optionalLabel = z
  .string()
  .trim()
  .min(1, "Label is required")
  .max(200, "Label is too long");

const metricKeySchema = z.enum(THESIS_METRIC_KEYS);
const eventTypeSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((v) => isCompanyEventType(v), {
    message: "Invalid or unsupported event type",
  });
const polaritySchema = z.enum(THESIS_CONDITION_POLARITIES);
const growthPeriodSchema = z.enum(GROWTH_PERIODS).default("yoy");

const finiteNumber = z.number().finite();

/** Metric level thresholds (absolute value — units implied by metricKey). */
const metricThresholdParams = z
  .object({
    metricKey: metricKeySchema,
    threshold: finiteNumber,
  })
  .strict();

/** Growth thresholds as percent (e.g. 25 = 25%). */
const metricGrowthParams = z
  .object({
    metricKey: metricKeySchema,
    thresholdPercent: finiteNumber,
    period: growthPeriodSchema.optional(),
  })
  .strict();

const eventTypeParams = z
  .object({
    eventType: eventTypeSchema,
  })
  .strict();

const shareCountParams = z
  .object({
    thresholdPercent: finiteNumber.positive(),
    period: growthPeriodSchema.optional(),
  })
  .strict();

const capitalRiskParams = z
  .object({
    /** Status must stay at or below this ceiling (elevated is highest). */
    maxStatus: z.enum(CAPITAL_RISK_STATUS_LEVELS),
  })
  .strict();

const cashRunwayParams = z
  .object({
    quarters: finiteNumber.positive().max(40),
  })
  .strict();

const customManualParams = z
  .object({
    text: z.string().trim().min(1).max(2000),
  })
  .strict();

export const thesisConditionParamsByType = {
  METRIC_ABOVE: metricThresholdParams,
  METRIC_BELOW: metricThresholdParams,
  METRIC_GROWTH_ABOVE: metricGrowthParams,
  METRIC_GROWTH_BELOW: metricGrowthParams,
  NO_EVENT_TYPE: eventTypeParams,
  EVENT_TYPE_OCCURRED: eventTypeParams,
  SHARE_COUNT_CHANGE_BELOW: shareCountParams,
  CAPITAL_RISK_NOT_ABOVE: capitalRiskParams,
  CASH_RUNWAY_ABOVE: cashRunwayParams,
  CUSTOM_MANUAL: customManualParams,
} as const;

export const thesisConditionInputSchema = z
  .object({
    conditionType: z.enum(THESIS_CONDITION_TYPES),
    label: optionalLabel,
    polarity: polaritySchema.optional().default("support_if"),
    params: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .strict()
  .superRefine((val, ctx) => {
    const schema = thesisConditionParamsByType[val.conditionType];
    const parsed = schema.safeParse(val.params ?? {});
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({
          code: "custom",
          message: issue.message,
          path: ["params", ...issue.path],
        });
      }
    }
  })
  .transform((val) => {
    const schema = thesisConditionParamsByType[val.conditionType];
    const params = schema.parse(val.params ?? {});
    return {
      conditionType: val.conditionType,
      label: val.label,
      polarity: val.polarity,
      params,
    };
  });

export type ThesisConditionInput = z.infer<typeof thesisConditionInputSchema>;

/** POST /api/thesis */
export const createThesisBodySchema = z
  .object({
    symbol: thesisSymbolSchema,
    title: optionalTitle,
    note: optionalNote,
    /** Alias for note (maps to InvestmentThesis.premise). */
    premise: optionalNote,
    status: z.enum(THESIS_STATUSES).optional().default("active"),
    conditions: z.array(thesisConditionInputSchema).max(40).optional(),
  })
  .strict();

/** PATCH /api/thesis/[id] */
export const updateThesisBodySchema = z
  .object({
    title: optionalTitle,
    note: optionalNote,
    premise: optionalNote,
    status: z.enum(THESIS_STATUSES).optional(),
  })
  .strict()
  .refine(
    (b) =>
      b.title !== undefined ||
      b.note !== undefined ||
      b.premise !== undefined ||
      b.status !== undefined,
    { message: "Provide at least one field to update" }
  );

/** PATCH condition — all fields optional but validated when present. */
export const updateConditionBodySchema = z
  .object({
    conditionType: z.enum(THESIS_CONDITION_TYPES).optional(),
    label: optionalLabel.optional(),
    polarity: polaritySchema.optional(),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (
      val.conditionType === undefined &&
      val.label === undefined &&
      val.polarity === undefined &&
      val.params === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Provide at least one field to update",
      });
      return;
    }
    // When type or params change, require coherent params for the effective type.
    if (val.conditionType !== undefined || val.params !== undefined) {
      if (val.conditionType === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "conditionType is required when updating params",
          path: ["conditionType"],
        });
        return;
      }
      const schema = thesisConditionParamsByType[val.conditionType];
      const parsed = schema.safeParse(val.params ?? {});
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({
            code: "custom",
            message: issue.message,
            path: ["params", ...issue.path],
          });
        }
      }
    }
  });

/** PUT /api/thesis/[id]/conditions/reorder */
export const reorderConditionsBodySchema = z
  .object({
    orderedIds: z
      .array(z.string().min(1).max(64))
      .min(1)
      .max(40),
  })
  .strict();

export const thesisListQuerySchema = z.object({
  symbol: thesisSymbolSchema.optional(),
  status: z.enum(THESIS_STATUSES).optional(),
});

export function zodErrorMessage(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid request";
}

export type CreateThesisBody = z.infer<typeof createThesisBodySchema>;
export type UpdateThesisBody = z.infer<typeof updateThesisBodySchema>;
export type UpdateConditionBody = z.infer<typeof updateConditionBodySchema>;
export type ReorderConditionsBody = z.infer<typeof reorderConditionsBodySchema>;
