import type {
  ConditionEvalDetail,
  StrategyCondition,
  StrategyEvalFacts,
} from "./types.ts";

function fmt(v: unknown): string {
  if (v == null) return "unavailable";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function asList(v: StrategyCondition["value"]): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (v == null) return [];
  return [String(v)];
}

function factValue(facts: StrategyEvalFacts, field: StrategyCondition["field"]): unknown {
  switch (field) {
    case "watchlist_membership":
      return facts.onWatchlist;
    case "price":
      return facts.price;
    case "float_m":
      return facts.floatM;
    case "float_confidence":
      return facts.floatConfidence;
    case "catalyst_category":
      return facts.catalystCategory;
    case "source_tier":
      return facts.sourceTier;
    case "confirmation_count":
      return facts.confirmationCount;
    case "catalyst_strength":
      return facts.catalystStrength;
    case "reaction_stage":
      return facts.reactionStage;
    case "relative_volume":
      return facts.relativeVolume;
    case "dollar_volume":
      return facts.dollarVolume;
    case "pct_move":
      return facts.pctMove;
    case "spread_bps":
      return facts.spreadBps;
    case "tradeability":
      return facts.tradeability;
    case "dilution_flag":
      return (facts.dilutionFlags?.length ?? 0) > 0;
    case "market_session":
      return facts.marketSession;
    case "halt_status":
      return facts.haltStatus;
    case "max_catalyst_age_min":
      return facts.catalystAgeMin;
    case "ticker_exclusion":
      return facts.symbol;
    case "sector":
      return facts.sector;
    case "exchange":
      return facts.exchange;
    default:
      return null;
  }
}

/**
 * Evaluate a single condition against facts.
 * Missing numeric facts fail closed for gte/lte/between (cannot confirm).
 */
export function evaluateCondition(
  condition: StrategyCondition,
  facts: StrategyEvalFacts
): ConditionEvalDetail {
  const actualRaw = factValue(facts, condition.field);
  const expected = fmt(condition.value);
  let passed = false;
  let detail = "";

  switch (condition.op) {
    case "is_true":
      passed = actualRaw === true;
      detail = passed ? "true" : `got ${fmt(actualRaw)}`;
      break;
    case "is_false":
      passed = actualRaw === false;
      detail = passed ? "false" : `got ${fmt(actualRaw)}`;
      break;
    case "eq":
      passed =
        actualRaw != null &&
        String(actualRaw).toLowerCase() === String(condition.value).toLowerCase();
      detail = `actual ${fmt(actualRaw)}`;
      break;
    case "neq":
      passed =
        actualRaw == null ||
        String(actualRaw).toLowerCase() !== String(condition.value).toLowerCase();
      detail = `actual ${fmt(actualRaw)}`;
      break;
    case "in": {
      const list = asList(condition.value).map((s) => s.toLowerCase());
      if (condition.field === "ticker_exclusion") {
        // Exclusion list: pass when symbol NOT in list
        passed = !list.includes(String(actualRaw ?? "").toLowerCase());
        detail = passed ? "not excluded" : "ticker excluded";
        break;
      }
      passed =
        actualRaw != null && list.includes(String(actualRaw).toLowerCase());
      detail = `actual ${fmt(actualRaw)}`;
      break;
    }
    case "not_in": {
      const list = asList(condition.value).map((s) => s.toLowerCase());
      passed =
        actualRaw == null || !list.includes(String(actualRaw).toLowerCase());
      detail = `actual ${fmt(actualRaw)}`;
      break;
    }
    case "gte": {
      const a = asNum(actualRaw);
      const b = asNum(condition.value);
      passed = a != null && b != null && a >= b;
      detail = a == null ? "actual unavailable" : `${a} ≥ ${b}`;
      break;
    }
    case "lte": {
      const a = asNum(actualRaw);
      const b = asNum(condition.value);
      // Special: max_catalyst_age_min — age must be ≤ value
      passed = a != null && b != null && a <= b;
      detail = a == null ? "actual unavailable" : `${a} ≤ ${b}`;
      break;
    }
    case "between": {
      const a = asNum(actualRaw);
      const range = Array.isArray(condition.value)
        ? (condition.value as [number, number])
        : null;
      passed =
        a != null &&
        range != null &&
        range.length >= 2 &&
        a >= Number(range[0]) &&
        a <= Number(range[1]);
      detail = a == null ? "actual unavailable" : `${a} in ${fmt(range)}`;
      break;
    }
    default:
      passed = false;
      detail = "unknown operator";
  }

  // Dilution flag with is_true already handled
  if (condition.field === "ticker_exclusion" && condition.op !== "in") {
    // Prefer op=in for exclusions; treat eq as single exclude
    if (condition.op === "eq") {
      passed =
        String(actualRaw ?? "").toUpperCase() !==
        String(condition.value ?? "").toUpperCase();
      detail = passed ? "not excluded" : "ticker excluded";
    }
  }

  return {
    conditionId: condition.id,
    field: condition.field,
    op: condition.op,
    passed,
    actual: fmt(actualRaw),
    expected,
    detail,
  };
}
