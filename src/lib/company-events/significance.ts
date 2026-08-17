/**
 * Deterministic event significance — review priority, NOT buy/sell advice.
 *
 * Levels: HIGH | MEDIUM | LOW | INFORMATIONAL
 * Every result includes reasonCodes[] + evidence.
 * Thesis relevance can layer later via `thesisRelevance` (null until wired).
 *
 * Docs: docs/EVENT_SIGNIFICANCE.md
 */

import type { CompanyEventType } from "./types.ts";

export const EVENT_SIGNIFICANCE_VERSION = "1.0.0";

export const SIGNIFICANCE_LEVELS = [
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFORMATIONAL",
] as const;

export type SignificanceLevel = (typeof SIGNIFICANCE_LEVELS)[number];

export const SIGNIFICANCE_REASON_CODES = [
  // HIGH
  "GOING_CONCERN",
  "BANKRUPTCY_RECEIVERSHIP",
  "AUDITOR_RESIGNATION_OR_DISMISSAL",
  "RESTATEMENT_OR_NON_RELIANCE",
  "MAJOR_CAPITAL_RAISE",
  "MAJOR_MANAGEMENT_DEPARTURE",
  "LATE_PERIODIC_REPORT",
  "SUBSTANTIAL_SHARE_COUNT_INCREASE",
  "IMPAIRMENT_DISCLOSURE",
  // MEDIUM
  "NEW_SHELF_REGISTRATION",
  "OWNERSHIP_THRESHOLD_CHANGE",
  "OWNERSHIP_MATERIAL_NEW",
  "OWNERSHIP_PCT_CHANGE",
  "OWNERSHIP_EXIT_REDUCTION",
  "NEW_DEBT_OR_MATERIAL_AGREEMENT",
  "MATERIAL_MARGIN_OR_RESULTS",
  "INSIDER_OPEN_MARKET_SALE",
  "ATM_PROGRAM_DETECTED",
  "CAPITAL_RISK_LEVEL_CHANGE",
  "CONVERTIBLE_OR_WARRANT_CAPITAL",
  "DIRECTOR_OR_BOARD_CHANGE",
  "INSIDER_CLUSTER",
  // LOW
  "ROUTINE_PERIODIC_FILING",
  "ROUTINE_OWNERSHIP_AMENDMENT",
  "ROUTINE_INSIDER_FORM",
  "EFFECTIVE_REGISTRATION_NOTICE",
  "PROXY_OR_ADMINISTRATIVE",
  // INFORMATIONAL / fail-soft
  "ROUTINE_COMPENSATION_GRANT",
  "ADMINISTRATIVE_FILING",
  "NO_MATERIAL_IMPACT_EVIDENCE",
  "UNKNOWN_OR_INSUFFICIENT_EVIDENCE",
  "LOW_CLASSIFIER_CONFIDENCE",
] as const;

export type SignificanceReasonCode =
  (typeof SIGNIFICANCE_REASON_CODES)[number];

export type SignificanceEvidenceItem = {
  code: SignificanceReasonCode;
  detail: string;
  source: "event_type" | "text" | "evidence_json" | "default";
};

export type EventSignificanceResult = {
  level: SignificanceLevel;
  reasonCodes: SignificanceReasonCode[];
  evidence: SignificanceEvidenceItem[];
  engineVersion: string;
  /**
   * Reserved for future thesis overlay (user conditions).
   * Always null in v1 — do not invent thesis relevance here.
   */
  thesisRelevance: null;
};

export type EventSignificanceInput = {
  eventType: string;
  category?: string | null;
  title?: string | null;
  summary?: string | null;
  body?: string | null;
  evidenceJson?: Record<string, unknown> | null;
  /** Classifier confidence 0–1 when known. */
  confidence?: number | null;
};

const LEVEL_RANK: Record<SignificanceLevel, number> = {
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFORMATIONAL: 1,
};

/** Map significance → legacy CompanyEvent.severity column (for sort/filter). */
export function significanceToLegacySeverity(
  level: SignificanceLevel
): "critical" | "material" | "notable" | "info" | "unknown" {
  switch (level) {
    case "HIGH":
      return "critical";
    case "MEDIUM":
      return "material";
    case "LOW":
      return "notable";
    case "INFORMATIONAL":
      return "info";
  }
}

function maxLevel(a: SignificanceLevel, b: SignificanceLevel): SignificanceLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

function corpus(input: EventSignificanceInput): string {
  return [input.title ?? "", input.summary ?? "", input.body ?? ""].join("\n");
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

type FiredRule = {
  level: SignificanceLevel;
  code: SignificanceReasonCode;
  detail: string;
  source: SignificanceEvidenceItem["source"];
};

/**
 * Score how much a disclosure may deserve review.
 * Unknown / thin evidence → INFORMATIONAL (never falsely dramatic).
 */
export function scoreEventSignificance(
  input: EventSignificanceInput
): EventSignificanceResult {
  const fired: FiredRule[] = [];
  const text = corpus(input);
  const ev = input.evidenceJson ?? {};
  const eventType = (input.eventType ?? "").trim();
  const conf =
    typeof input.confidence === "number" && Number.isFinite(input.confidence)
      ? input.confidence
      : null;

  const fire = (
    level: SignificanceLevel,
    code: SignificanceReasonCode,
    detail: string,
    source: SignificanceEvidenceItem["source"]
  ) => {
    fired.push({ level, code, detail, source });
  };

  // —— Text cues (only when patterns are affirmative) ——
  if (
    /\bgoing\s+concern\b/i.test(text) ||
    /\bsubstantial\s+doubt\s+about\s+(the\s+)?(company['’]?s\s+)?ability\s+to\s+continue\b/i.test(
      text
    )
  ) {
    fire(
      "HIGH",
      "GOING_CONCERN",
      "Going-concern / substantial-doubt language present in disclosure text",
      "text"
    );
  }

  if (
    /\bchapter\s*11\b/i.test(text) ||
    /\bbankruptcy\s+or\s+receivership\b/i.test(text) ||
    /\breceivership\b/i.test(text)
  ) {
    fire(
      "HIGH",
      "BANKRUPTCY_RECEIVERSHIP",
      "Bankruptcy / receivership language present",
      "text"
    );
  }

  if (
    /\bnon[- ]reliance\b/i.test(text) ||
    /\brestatement\s+of\s+(previously\s+issued\s+)?financial\b/i.test(text)
  ) {
    fire(
      "HIGH",
      "RESTATEMENT_OR_NON_RELIANCE",
      "Restatement / non-reliance language present",
      "text"
    );
  }

  if (
    /\b(ceo|chief\s+executive)\s+(resign|resigns|resigned|departure|departed)\b/i.test(
      text
    ) ||
    /\b(cfo|chief\s+financial)\s+(resign|resigns|resigned|departure|departed)\b/i.test(
      text
    )
  ) {
    fire(
      "HIGH",
      "MAJOR_MANAGEMENT_DEPARTURE",
      "CEO/CFO resignation or departure language present",
      "text"
    );
  }

  const isGrant =
    /\b(rsu|restricted\s+stock\s+unit|option\s+grant|stock\s+option\s+award|equity\s+award|compensation\s+grant)\b/i.test(
      text
    ) ||
    /\baward(ed|s)?\s+(of\s+)?(options|rsus|shares)\b/i.test(text);

  const isOpenMarketSale =
    /\bopen[- ]market\s+sale\b/i.test(text) ||
    (/\bsale\b/i.test(text) &&
      /\b(common\s+stock|shares)\b/i.test(text) &&
      !isGrant &&
      !/\bpurchase\b/i.test(text));

  // —— Event-type rules ——
  switch (eventType as CompanyEventType | string) {
    case "bankruptcy_receivership":
    case "bankruptcy":
      fire(
        "HIGH",
        "BANKRUPTCY_RECEIVERSHIP",
        `Event type ${eventType} indicates bankruptcy/receivership disclosure`,
        "event_type"
      );
      break;

    case "auditor_change":
      fire(
        "HIGH",
        "AUDITOR_RESIGNATION_OR_DISMISSAL",
        "Auditor / certifying accountant change event",
        "event_type"
      );
      break;

    case "non_reliance_restatement":
      fire(
        "HIGH",
        "RESTATEMENT_OR_NON_RELIANCE",
        "Non-reliance / restatement event",
        "event_type"
      );
      break;

    case "sec_nt_10k":
    case "sec_nt_10q":
      fire(
        "HIGH",
        "LATE_PERIODIC_REPORT",
        "Notification of late Form 10-K/10-Q filing",
        "event_type"
      );
      break;

    case "impairment":
      fire(
        "HIGH",
        "IMPAIRMENT_DISCLOSURE",
        "Material impairment disclosure event",
        "event_type"
      );
      break;

    case "management_change":
      fire(
        "HIGH",
        "MAJOR_MANAGEMENT_DEPARTURE",
        "Management / officer change event (review for material departure)",
        "event_type"
      );
      break;

    case "registered_direct":
    case "offering_priced":
    case "share_issuance":
      fire(
        "HIGH",
        "MAJOR_CAPITAL_RAISE",
        "Announced or priced capital raise / share issuance event",
        "event_type"
      );
      break;

    case "atm_program":
      fire(
        "MEDIUM",
        "ATM_PROGRAM_DETECTED",
        "ATM program detected — capacity/availability, not automatically a completed sale",
        "event_type"
      );
      break;

    case "capital_risk_level_change":
      fire(
        "MEDIUM",
        "CAPITAL_RISK_LEVEL_CHANGE",
        "Capital risk classification changed — factual posture, not a prediction of issuance",
        "event_type"
      );
      break;

    case "shelf_registration":
    case "s1_registration":
    case "sec_s1":
    case "sec_s3":
    case "sec_s1_a":
    case "sec_s3_a":
      fire(
        "MEDIUM",
        "NEW_SHELF_REGISTRATION",
        "Registration / shelf capacity event (not a confirmed sale by itself)",
        "event_type"
      );
      break;

    case "prospectus_424b5":
    case "sec_424b5":
      fire(
        "MEDIUM",
        "MAJOR_CAPITAL_RAISE",
        "424B5 prospectus — often accompanies a capital raise; review evidence",
        "event_type"
      );
      break;

    case "convertible_instrument":
    case "warrant_issuance":
    case "warrant_reprice":
    case "warrant_exercise_window":
      fire(
        "MEDIUM",
        "CONVERTIBLE_OR_WARRANT_CAPITAL",
        "Convertible or warrant-related capital structure event",
        "event_type"
      );
      break;

    case "beneficial_ownership_material_new":
      fire(
        "MEDIUM",
        "OWNERSHIP_MATERIAL_NEW",
        "New material beneficial ownership filing with reported percentage",
        "event_type"
      );
      break;

    case "beneficial_ownership_pct_change":
      fire(
        "MEDIUM",
        "OWNERSHIP_PCT_CHANGE",
        "Meaningful change in reported beneficial ownership percentage",
        "event_type"
      );
      break;

    case "beneficial_ownership_exit":
      fire(
        "MEDIUM",
        "OWNERSHIP_EXIT_REDUCTION",
        "Beneficial ownership exit or material reduction established by filing",
        "event_type"
      );
      break;

    case "sec_13d":
    case "beneficial_ownership_13d":
    case "sec_13d_a":
    case "sec_13g":
    case "beneficial_ownership_13g":
      fire(
        "MEDIUM",
        "OWNERSHIP_THRESHOLD_CHANGE",
        "Beneficial ownership report / amendment",
        "event_type"
      );
      break;

    case "material_agreement":
      fire(
        "MEDIUM",
        "NEW_DEBT_OR_MATERIAL_AGREEMENT",
        "Entry into material definitive agreement",
        "event_type"
      );
      break;

    case "financial_results_8k":
    case "earnings_release":
    case "margin_delta":
    case "revenue_delta":
    case "eps_delta":
      fire(
        "MEDIUM",
        "MATERIAL_MARGIN_OR_RESULTS",
        "Results / financial condition or metric delta event",
        "event_type"
      );
      break;

    case "director_change":
    case "board_change":
      fire(
        "MEDIUM",
        "DIRECTOR_OR_BOARD_CHANGE",
        "Director / board change event",
        "event_type"
      );
      break;

    case "reverse_split":
      fire(
        "MEDIUM",
        "SUBSTANTIAL_SHARE_COUNT_INCREASE",
        "Reverse split affects share count presentation — review for context",
        "event_type"
      );
      break;

    case "sec_10k":
    case "sec_10q":
      fire(
        "LOW",
        "ROUTINE_PERIODIC_FILING",
        "Periodic report filing (review contents separately for going concern etc.)",
        "event_type"
      );
      break;

    case "sec_13g_a":
    case "institutional_13f_update":
    case "sec_13f":
      fire(
        "LOW",
        "ROUTINE_OWNERSHIP_AMENDMENT",
        "Routine ownership amendment / 13F-style update",
        "event_type"
      );
      break;

    case "sec_form3":
    case "sec_form5":
    case "sec_form144":
    case "insider_form4":
    case "sec_form4":
      if (isGrant) {
        fire(
          "INFORMATIONAL",
          "ROUTINE_COMPENSATION_GRANT",
          "Insider form appears to describe compensation / equity grant",
          "text"
        );
      } else if (isOpenMarketSale) {
        fire(
          "MEDIUM",
          "INSIDER_OPEN_MARKET_SALE",
          "Insider open-market sale language present — context-dependent",
          "text"
        );
      } else {
        fire(
          "LOW",
          "ROUTINE_INSIDER_FORM",
          "Insider ownership form without higher-priority sale/grant cues",
          "event_type"
        );
      }
      break;

    case "insider_sale":
      fire(
        "MEDIUM",
        "INSIDER_OPEN_MARKET_SALE",
        "Structured open-market sale (Form 4 code S) — not every disposition",
        "event_type"
      );
      break;

    case "insider_grant":
      fire(
        "INFORMATIONAL",
        "ROUTINE_COMPENSATION_GRANT",
        "Insider grant / compensation event",
        "event_type"
      );
      break;

    case "insider_purchase":
      fire(
        "LOW",
        "ROUTINE_INSIDER_FORM",
        "Insider open-market purchase — informational, not a buy signal",
        "event_type"
      );
      break;

    case "insider_disposition_other":
      fire(
        "LOW",
        "ROUTINE_INSIDER_FORM",
        "Insider transaction that is not classified as open-market sale/purchase (e.g. tax withholding, gift, exercise, other)",
        "event_type"
      );
      break;

    case "insider_cluster_purchases":
    case "insider_cluster_sales":
      fire(
        "INFORMATIONAL",
        "INSIDER_CLUSTER",
        "Multiple open-market insider transactions in a short window — informational cluster, not predictive alpha",
        "event_type"
      );
      break;

    case "effective_registration":
    case "sec_effect":
      fire(
        "LOW",
        "EFFECTIVE_REGISTRATION_NOTICE",
        "Registration effectiveness notice",
        "event_type"
      );
      break;

    case "sec_def_14a":
    case "shareholder_meeting":
    case "charter_amendment":
      fire(
        "LOW",
        "PROXY_OR_ADMINISTRATIVE",
        "Proxy / governance administrative disclosure",
        "event_type"
      );
      break;

    case "sec_8k":
      fire(
        "LOW",
        "ADMINISTRATIVE_FILING",
        "Generic 8-K without a higher-priority item classification",
        "event_type"
      );
      break;

    case "sec_other":
      fire(
        "INFORMATIONAL",
        "UNKNOWN_OR_INSUFFICIENT_EVIDENCE",
        "Form type not confidently resolved",
        "event_type"
      );
      break;

    default:
      // Unknown type — do not escalate
      break;
  }

  // —— Structured evidence JSON (capital sizing) ——
  const maxShares = num(ev.maxShares);
  const denom = num(ev.sharesOutstandingDenom);
  const maxDollars = num(ev.maxDollars);
  const estimateLabel =
    typeof ev.estimateLabel === "string" ? ev.estimateLabel : null;
  const capacityKind =
    typeof ev.capacityKind === "string" ? ev.capacityKind : null;

  if (
    maxShares != null &&
    denom != null &&
    denom > 0 &&
    maxShares / denom >= 0.2
  ) {
    fire(
      "HIGH",
      "SUBSTANTIAL_SHARE_COUNT_INCREASE",
      `Potential share issuance ≥20% of outstanding denominator (${maxShares} / ${denom})`,
      "evidence_json"
    );
  }

  if (
    estimateLabel === "announced_sale" ||
    capacityKind === "announced_sale" ||
    capacityKind === "confirmed_issuance"
  ) {
    fire(
      "HIGH",
      "MAJOR_CAPITAL_RAISE",
      "Dilution evidence labeled announced sale / confirmed issuance",
      "evidence_json"
    );
  }

  if (
    maxDollars != null &&
    maxDollars >= 50_000_000 &&
    (eventType.includes("424") ||
      eventType.includes("registered") ||
      eventType.includes("offering") ||
      eventType.includes("atm") ||
      eventType.includes("shelf") ||
      eventType.includes("s1") ||
      eventType.includes("s3"))
  ) {
    fire(
      "MEDIUM",
      "MAJOR_CAPITAL_RAISE",
      `Large capacity/offer size in evidence (≥ $50M): ${maxDollars}`,
      "evidence_json"
    );
  }

  // —— Confidence softener ——
  if (conf != null && conf < 0.45 && fired.length > 0) {
    fire(
      "INFORMATIONAL",
      "LOW_CLASSIFIER_CONFIDENCE",
      `Classifier confidence ${conf.toFixed(2)} is low — prefer verification before escalating review`,
      "default"
    );
  }

  // —— Fail soft ——
  if (fired.length === 0) {
    fire(
      "INFORMATIONAL",
      "NO_MATERIAL_IMPACT_EVIDENCE",
      "No significance rule matched with sufficient evidence",
      "default"
    );
  }

  // Aggregate: take highest level among fires, but if ONLY low-confidence
  // softener fired with highs, still keep the high reasons — user asked for
  // reason codes of what matched. Level = max of fired levels, EXCEPT when
  // the only fires are INFORMATIONAL defaults.
  //
  // Special case: LOW_CLASSIFIER_CONFIDENCE alone should not raise level;
  // when paired with HIGH/MEDIUM, keep the higher level but include the code.
  let level: SignificanceLevel = "INFORMATIONAL";
  for (const f of fired) {
    if (f.code === "LOW_CLASSIFIER_CONFIDENCE") continue;
    level = maxLevel(level, f.level);
  }
  // If everything was only the confidence softener + nothing else meaningful
  if (
    fired.every(
      (f) =>
        f.code === "LOW_CLASSIFIER_CONFIDENCE" ||
        f.code === "NO_MATERIAL_IMPACT_EVIDENCE" ||
        f.code === "UNKNOWN_OR_INSUFFICIENT_EVIDENCE"
    )
  ) {
    level = "INFORMATIONAL";
  }

  // When confidence is very low, cap at MEDIUM to avoid false drama
  if (conf != null && conf < 0.45 && LEVEL_RANK[level] > LEVEL_RANK.MEDIUM) {
    level = "MEDIUM";
  }

  const reasonCodes = [...new Set(fired.map((f) => f.code))];
  const evidence: SignificanceEvidenceItem[] = fired.map((f) => ({
    code: f.code,
    detail: f.detail,
    source: f.source,
  }));

  return {
    level,
    reasonCodes,
    evidence,
    engineVersion: EVENT_SIGNIFICANCE_VERSION,
    thesisRelevance: null,
  };
}

export function isSignificanceLevel(v: string): v is SignificanceLevel {
  return (SIGNIFICANCE_LEVELS as readonly string[]).includes(v);
}

export function isSignificanceReasonCode(
  v: string
): v is SignificanceReasonCode {
  return (SIGNIFICANCE_REASON_CODES as readonly string[]).includes(v);
}
