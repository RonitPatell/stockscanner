import type { DecisionRiskFlag } from "./types.ts";
import type { JudgmentV2 } from "../judgment/types.ts";
import { isDilutionCatalyst } from "../action-playbook.ts";

const PROMO_RE =
  /\b(breaking|must\s+buy|guaranteed|moon|to\s+the\s+moon|huge\s+news|explosive|secret)\b/i;
const STALE_RE =
  /\b(as\s+previously\s+(announced|reported|disclosed)|reiterates?|still\s+plans|update\s+on\s+prior|previously\s+disclosed)\b/i;
const REVERSE_SPLIT_RE = /\breverse\s+(stock\s+)?split\b/i;
const WARRANT_RE = /\bwarrants?\b/i;
const CONVERTIBLE_RE = /\bconvertible\b/i;
const ATM_RE = /\bat[\s-]?the[\s-]?market\b|\batm\s+(offering|program|facility)\b/i;
const SHELF_RE = /\bshelf\s+registration\b|\bform\s*s-3\b/i;
const OFFERING_RE = /\bregistered\s+direct\b|\bpublic\s+offering\b|\bsecondary\s+offering\b/i;
const HALT_RE = /\b(trading\s+halt|halted|luld)\b/i;

export interface RiskInput {
  headline: string;
  summary?: string | null;
  catalystType?: string | null;
  matchMethod?: string | null;
  verifiedConfidence?: number | null;
  changePercent?: number | null;
  judgment?: JudgmentV2 | null;
  dilutionTypes?: string[];
  missingCritical?: string[];
}

function flag(
  id: string,
  label: string,
  severity: DecisionRiskFlag["severity"],
  active: boolean,
  detail: string,
  evidenceUrl?: string | null
): DecisionRiskFlag {
  return { id, label, severity, active, detail, evidenceUrl };
}

/** Build risk strip — inactive risks stay listed for honesty in detailed mode. */
export function buildDecisionRisks(input: RiskInput): DecisionRiskFlag[] {
  const text = `${input.headline} ${input.summary ?? ""}`;
  const jFlags = new Set((input.judgment?.riskFlags ?? []).map((r) => r.id));
  const dil = new Set((input.dilutionTypes ?? []).map((t) => t.toUpperCase()));

  const dilution =
    isDilutionCatalyst({
      catalystType: input.catalystType,
      headline: input.headline,
    }) ||
    jFlags.has("dilution") ||
    jFlags.has("positive_with_dilution");

  const flags: DecisionRiskFlag[] = [
    flag(
      "active_shelf",
      "Active shelf",
      "high",
      dil.has("S3_SHELF") || dil.has("S1_REGISTRATION") || SHELF_RE.test(text),
      dil.has("S3_SHELF") || dil.has("S1_REGISTRATION")
        ? "Dilution Radar shows an active registration / shelf instrument"
        : SHELF_RE.test(text)
          ? "Shelf / S-3 language in headline or summary"
          : "No active shelf signal"
    ),
    flag(
      "atm",
      "ATM",
      "high",
      dil.has("ATM_PROGRAM") || ATM_RE.test(text),
      dil.has("ATM_PROGRAM")
        ? "ATM program detected in filing evidence"
        : ATM_RE.test(text)
          ? "ATM language in catalyst text"
          : "No ATM signal"
    ),
    flag(
      "registered_offering",
      "Registered offering",
      "high",
      dil.has("REGISTERED_DIRECT") ||
        dil.has("PROSPECTUS_424B5") ||
        OFFERING_RE.test(text) ||
        dilution,
      dilution || OFFERING_RE.test(text)
        ? "Offering / prospectus / registered-direct language present"
        : "No registered offering signal"
    ),
    flag(
      "warrants",
      "Warrants",
      "medium",
      dil.has("WARRANT") || dil.has("WARRANT_REPRICE") || WARRANT_RE.test(text),
      "Warrant language or Dilution Radar warrant instrument"
    ),
    flag(
      "convertible",
      "Convertible securities",
      "high",
      dil.has("CONVERTIBLE_NOTE") ||
        dil.has("CONVERTIBLE_PREFERRED") ||
        CONVERTIBLE_RE.test(text),
      "Convertible note/preferred language or instrument"
    ),
    flag(
      "reverse_split",
      "Reverse split",
      "high",
      dil.has("REVERSE_SPLIT") || REVERSE_SPLIT_RE.test(text),
      "Reverse split language or instrument"
    ),
    flag(
      "stale_news",
      "Stale or recycled news",
      "medium",
      STALE_RE.test(text) ||
        input.judgment?.timing === "STALE" ||
        jFlags.has("stale"),
      "Previously disclosed / stale timing signals"
    ),
    flag(
      "promotional",
      "Promotional language",
      "medium",
      PROMO_RE.test(text) || jFlags.has("promotional"),
      "Promotional or hype language detected"
    ),
    flag(
      "ambiguous_ticker",
      "Ambiguous ticker match",
      "high",
      jFlags.has("ambiguous_ticker") ||
        input.matchMethod === "company_name" ||
        (input.verifiedConfidence != null && input.verifiedConfidence < 40),
      "Low match confidence or ambiguous company-name match"
    ),
    flag(
      "already_extended",
      "Already-extended reaction",
      "medium",
      jFlags.has("extended") ||
        (input.changePercent != null && Math.abs(input.changePercent) >= 25),
      "Tape already extended on the day or judgment flagged extended"
    ),
    flag(
      "missing_critical",
      "Missing critical information",
      "medium",
      (input.missingCritical?.length ?? 0) > 0 ||
        (input.judgment?.missingOrUncertain?.length ?? 0) > 0,
      input.missingCritical?.[0] ||
        input.judgment?.missingOrUncertain?.[0] ||
        "No critical gaps listed"
    ),
    flag(
      "halt_language",
      "Halt language",
      "high",
      HALT_RE.test(text),
      HALT_RE.test(text)
        ? "Headline/summary mentions a trading halt"
        : "No halt language"
    ),
  ];

  return flags;
}
