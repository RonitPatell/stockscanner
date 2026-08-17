/**
 * Thesis relevance overlay for What Changed cards.
 * Deterministic matching only — never invents relevance.
 * Never returns thesis note/premise text.
 */

import type {
  EventRowForWhatChanged,
  ThesisConditionOverlayInput,
  ThesisRelevanceDto,
} from "./types.ts";

function asEventType(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

const CAPITAL_EVENT_HINT = /capital|shelf|atm|offering|dilution|warrant|convertible|share_issuance|registered_direct/i;
const FINANCIAL_EVENT_HINT = /financial|metric|earnings|results|margin|revenue/i;
const INSIDER_EVENT_HINT = /insider/i;
const OWNERSHIP_EVENT_HINT = /ownership|13d|13g|13f|beneficial/i;

/**
 * Score one event against the user's thesis conditions.
 * Returns `none` when no match — caller may still set null on public mode.
 */
export function scoreThesisRelevance(opts: {
  event: Pick<EventRowForWhatChanged, "eventType" | "category" | "title">;
  conditions: ThesisConditionOverlayInput[];
}): ThesisRelevanceDto {
  const { event, conditions } = opts;
  if (!conditions.length) {
    return {
      status: "none",
      conditionId: null,
      conditionLabel: null,
      polarity: null,
      summary: "No active thesis conditions",
    };
  }

  // Exact event-type conditions first
  for (const c of conditions) {
    if (
      c.conditionType === "NO_EVENT_TYPE" ||
      c.conditionType === "EVENT_TYPE_OCCURRED"
    ) {
      const want = asEventType(c.params.eventType);
      if (want && want === event.eventType) {
        return {
          status: "matches_condition",
          conditionId: c.id,
          conditionLabel: c.label,
          polarity: c.polarity,
          summary:
            c.conditionType === "NO_EVENT_TYPE"
              ? `Matches your “no ${want}” condition`
              : `Matches your “${want} occurred” condition`,
        };
      }
    }
  }

  for (const c of conditions) {
    if (c.conditionType === "CAPITAL_RISK_NOT_ABOVE") {
      if (
        event.category === "capital" ||
        event.eventType === "capital_risk_level_change" ||
        CAPITAL_EVENT_HINT.test(event.eventType)
      ) {
        return {
          status: "matches_condition",
          conditionId: c.id,
          conditionLabel: c.label,
          polarity: c.polarity,
          summary: "Relevant to your capital-risk condition",
        };
      }
    }
    if (c.conditionType === "SHARE_COUNT_CHANGE_BELOW") {
      if (
        event.category === "capital" ||
        /share|dilution|issuance|offering|atm|warrant/i.test(event.eventType)
      ) {
        return {
          status: "matches_condition",
          conditionId: c.id,
          conditionLabel: c.label,
          polarity: c.polarity,
          summary: "Relevant to your share-count condition",
        };
      }
    }
    if (
      c.conditionType.startsWith("METRIC_") ||
      c.conditionType === "CASH_RUNWAY_ABOVE"
    ) {
      if (
        event.category === "financial" ||
        FINANCIAL_EVENT_HINT.test(event.eventType)
      ) {
        return {
          status: "related_category",
          conditionId: c.id,
          conditionLabel: c.label,
          polarity: c.polarity,
          summary: "Related to your financial metric conditions",
        };
      }
    }
  }

  // Soft category relatedness when user has any condition in that domain
  const hasCapital = conditions.some(
    (c) =>
      c.conditionType === "CAPITAL_RISK_NOT_ABOVE" ||
      c.conditionType === "SHARE_COUNT_CHANGE_BELOW" ||
      (c.conditionType === "NO_EVENT_TYPE" &&
        CAPITAL_EVENT_HINT.test(String(c.params.eventType ?? "")))
  );
  const hasFinancial = conditions.some((c) =>
    c.conditionType.startsWith("METRIC_")
  );
  const hasInsider = conditions.some(
    (c) =>
      (c.conditionType === "NO_EVENT_TYPE" ||
        c.conditionType === "EVENT_TYPE_OCCURRED") &&
      INSIDER_EVENT_HINT.test(String(c.params.eventType ?? ""))
  );
  const hasOwnership = conditions.some(
    (c) =>
      (c.conditionType === "NO_EVENT_TYPE" ||
        c.conditionType === "EVENT_TYPE_OCCURRED") &&
      OWNERSHIP_EVENT_HINT.test(String(c.params.eventType ?? ""))
  );

  if (hasCapital && event.category === "capital") {
    const c = conditions.find(
      (x) =>
        x.conditionType === "CAPITAL_RISK_NOT_ABOVE" ||
        x.conditionType === "SHARE_COUNT_CHANGE_BELOW"
    )!;
    return {
      status: "related_category",
      conditionId: c.id,
      conditionLabel: c.label,
      polarity: c.polarity,
      summary: "Related to your capital thesis conditions",
    };
  }
  if (hasFinancial && event.category === "financial") {
    const c = conditions.find((x) => x.conditionType.startsWith("METRIC_"))!;
    return {
      status: "related_category",
      conditionId: c.id,
      conditionLabel: c.label,
      polarity: c.polarity,
      summary: "Related to your financial thesis conditions",
    };
  }
  if (hasInsider && event.category === "insider") {
    return {
      status: "related_category",
      conditionId: null,
      conditionLabel: null,
      polarity: null,
      summary: "Related to your insider-related thesis conditions",
    };
  }
  if (hasOwnership && event.category === "ownership") {
    return {
      status: "related_category",
      conditionId: null,
      conditionLabel: null,
      polarity: null,
      summary: "Related to your ownership thesis conditions",
    };
  }

  return {
    status: "none",
    conditionId: null,
    conditionLabel: null,
    polarity: null,
    summary: "Not tied to your thesis conditions",
  };
}

/** Strip any accidental private fields before JSON response. */
export function sanitizeThesisRelevanceForClient(
  v: ThesisRelevanceDto | null | undefined
): ThesisRelevanceDto | null {
  if (!v) return null;
  return {
    status: v.status,
    conditionId: v.conditionId,
    conditionLabel: v.conditionLabel,
    polarity: v.polarity,
    summary: v.summary.slice(0, 200),
  };
}
