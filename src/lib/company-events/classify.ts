/**
 * Deterministic Company Event classifier — no LLM.
 * Never invents facts beyond title/summary/body/form evidence.
 */

import {
  formBaseMapping,
  resolveSecForm,
  type SupportedSecForm,
} from "./forms.ts";
import type {
  CompanyEventCategory,
  CompanyEventSeverity,
  CompanyEventType,
} from "./types.ts";
import { filingEventFingerprint } from "./types.ts";

export type ClassifyFilingInput = {
  symbol: string;
  cik?: string | null;
  formType?: string | null;
  accessionNumber?: string | null;
  sourceUrl?: string | null;
  rawNewsId?: string | null;
  title: string;
  summary?: string | null;
  body?: string | null;
  publishedAt?: Date | string | null;
  catalystId?: string | null;
};

export type ClassifiedCompanyEvent = {
  symbol: string;
  cik: string | null;
  category: CompanyEventCategory;
  eventType: CompanyEventType;
  severity: CompanyEventSeverity;
  title: string;
  summary: string | null;
  occurredAt: Date;
  sourceType: "sec";
  sourceId: string | null;
  sourceUrl: string | null;
  evidenceJson: Record<string, unknown>;
  fingerprint: string;
  catalystId: string | null;
  dilutionInstrumentId: string | null;
  /** 0–1 classifier confidence for this specific event. */
  confidence: number;
};

type ItemRule = {
  discriminant: string;
  eventType: CompanyEventType;
  category: CompanyEventCategory;
  severity: CompanyEventSeverity;
  /** Must match for reliable identification. */
  patterns: RegExp[];
  titleSuffix: string;
};

/** Material 8-K items — only when Item codes or clear phrases appear. */
const EIGHT_K_ITEM_RULES: ItemRule[] = [
  {
    discriminant: "item_4_01",
    eventType: "auditor_change",
    category: "governance",
    severity: "material",
    patterns: [
      /\bitem\s*4\.01\b/i,
      /\bchanges?\s+in\s+(registrant['’]?s\s+)?certifying\s+accountant/i,
      /\bauditor\s+(resignation|dismissal|change|appointment)\b/i,
    ],
    titleSuffix: "Auditor / certifying accountant change",
  },
  {
    discriminant: "item_5_02",
    eventType: "management_change",
    category: "management",
    severity: "material",
    patterns: [
      /\bitem\s*5\.02\b/i,
      /\bdeparture\s+of\s+directors?\s+or\s+certain\s+officers/i,
      /\b(ceo|cfo|chief\s+executive|chief\s+financial)\s+(resign|depart|appoint|named)\b/i,
    ],
    titleSuffix: "Officer / director departure or appointment",
  },
  {
    discriminant: "item_5_02_director",
    eventType: "director_change",
    category: "governance",
    severity: "notable",
    patterns: [
      /\bdirector\s+(resign|appoint|elected|departure)\b/i,
      /\bboard\s+of\s+directors\b.{0,40}\b(resign|appoint)\b/i,
    ],
    titleSuffix: "Director change",
  },
  {
    discriminant: "item_1_01",
    eventType: "material_agreement",
    category: "corporate",
    severity: "notable",
    patterns: [
      /\bitem\s*1\.01\b/i,
      /\bentry\s+into\s+a\s+material\s+definitive\s+agreement\b/i,
    ],
    titleSuffix: "Entry into material definitive agreement",
  },
  {
    discriminant: "item_1_03",
    eventType: "bankruptcy_receivership",
    category: "corporate",
    severity: "critical",
    patterns: [
      /\bitem\s*1\.03\b/i,
      /\bbankruptcy\s+or\s+receivership\b/i,
      /\bchapter\s*11\b/i,
    ],
    titleSuffix: "Bankruptcy or receivership",
  },
  {
    discriminant: "item_2_06",
    eventType: "impairment",
    category: "financial",
    severity: "material",
    patterns: [
      /\bitem\s*2\.06\b/i,
      /\bmaterial\s+impairments?\b/i,
      /\bgoodwill\s+impairment\b/i,
    ],
    titleSuffix: "Material impairment",
  },
  {
    discriminant: "item_2_02",
    eventType: "financial_results_8k",
    category: "financial",
    severity: "notable",
    patterns: [
      /\bitem\s*2\.02\b/i,
      /\bresults?\s+of\s+operations?\s+and\s+financial\s+condition\b/i,
      /\bearnings\s+release\b/i,
    ],
    titleSuffix: "Results of operations / financial condition",
  },
  {
    discriminant: "item_4_02",
    eventType: "non_reliance_restatement",
    category: "financial",
    severity: "critical",
    patterns: [
      /\bitem\s*4\.02\b/i,
      /\bnon[- ]reliance\b/i,
      /\brestatement\s+of\s+(previously\s+issued\s+)?financial\b/i,
    ],
    titleSuffix: "Non-reliance / restatement",
  },
];

function toDate(v: Date | string | null | undefined): Date {
  if (!v) return new Date();
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

function corpus(input: ClassifyFilingInput): string {
  return [input.title, input.summary ?? "", input.body ?? ""].join("\n");
}

/** True when pattern matches as an affirmative disclosure (not "No Item 5.02…"). */
function affirmativeMatch(text: string, re: RegExp): RegExpMatchArray | null {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  let m: RegExpMatchArray | null;
  while ((m = global.exec(text)) !== null) {
    const start = m.index ?? 0;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const line = text.slice(lineStart, start + m[0].length);
    // "No Item 4.01 or Item 5.02 …" negates item mentions on that line.
    if (/\bno\s+item\b/i.test(line) || /\bwithout\s+item\b/i.test(line)) {
      continue;
    }
    const before = text.slice(Math.max(0, start - 12), start).toLowerCase();
    if (/\bno\s+$/i.test(before) || /\bwithout\s+$/i.test(before)) {
      continue;
    }
    return m;
  }
  return null;
}

function ownershipEventType(form: SupportedSecForm): CompanyEventType | null {
  switch (form) {
    case "SC 13D":
      return "beneficial_ownership_13d";
    case "SC 13G":
      return "beneficial_ownership_13g";
    case "13F-HR":
      return "institutional_13f_update";
    default:
      return null;
  }
}

function insiderEventType(form: SupportedSecForm): CompanyEventType | null {
  if (form === "4") return "insider_form4";
  return null;
}

/**
 * Classify a primary-source disclosure into one or more CompanyEvents.
 * Always emits at least a generic form-level event when the form is known;
 * otherwise `sec_other` when text looks like an SEC filing.
 */
export function classifyFilingDisclosure(
  input: ClassifyFilingInput
): ClassifiedCompanyEvent[] {
  const symbol = input.symbol.trim().toUpperCase();
  if (!/^[A-Z]{1,5}$/.test(symbol)) return [];

  const form = resolveSecForm({
    formType: input.formType,
    rawNewsId: input.rawNewsId,
    title: input.title,
  });

  const text = corpus(input);
  const occurredAt = toDate(input.publishedAt);
  const sourceId =
    input.accessionNumber?.trim() ||
    input.rawNewsId?.trim() ||
    null;
  const events: ClassifiedCompanyEvent[] = [];

  const push = (
    partial: Omit<
      ClassifiedCompanyEvent,
      | "symbol"
      | "cik"
      | "sourceType"
      | "sourceId"
      | "sourceUrl"
      | "catalystId"
      | "dilutionInstrumentId"
      | "occurredAt"
      | "fingerprint"
    > & { discriminant: string; occurredAt?: Date }
  ) => {
    const fingerprint = filingEventFingerprint({
      symbol,
      eventType: partial.eventType,
      accession: input.accessionNumber,
      rawNewsId: input.rawNewsId,
      discriminant: partial.discriminant,
    });
    events.push({
      symbol,
      cik: input.cik ?? null,
      category: partial.category,
      eventType: partial.eventType,
      severity: partial.severity,
      title: partial.title,
      summary: partial.summary,
      occurredAt: partial.occurredAt ?? occurredAt,
      sourceType: "sec",
      sourceId,
      sourceUrl: input.sourceUrl ?? null,
      evidenceJson: partial.evidenceJson,
      fingerprint,
      catalystId: input.catalystId ?? null,
      dilutionInstrumentId: null,
      confidence: partial.confidence,
    });
  };

  if (form) {
    const base = formBaseMapping(form);
    push({
      discriminant: "form",
      category: base.category,
      eventType: base.eventType,
      severity: base.severity,
      title: input.title.slice(0, 300),
      summary: input.summary?.slice(0, 500) ?? null,
      confidence: 0.95,
      evidenceJson: {
        formType: form,
        accessionNumber: input.accessionNumber ?? null,
        rawNewsId: input.rawNewsId ?? null,
        match: "form_metadata",
      },
    });

    // Ownership aliases (same filing also tagged for Watchtower filters)
    const own = ownershipEventType(form);
    if (own && own !== base.eventType) {
      push({
        discriminant: "ownership",
        category: "ownership",
        eventType: own,
        severity: base.severity,
        title: `${form}: ${input.title}`.slice(0, 300),
        summary: input.summary?.slice(0, 500) ?? null,
        confidence: 0.9,
        evidenceJson: {
          formType: form,
          accessionNumber: input.accessionNumber ?? null,
          match: "form_ownership",
        },
      });
    }

    const insider = insiderEventType(form);
    if (insider && insider !== base.eventType) {
      push({
        discriminant: "insider",
        category: "insider",
        eventType: insider,
        severity: "notable",
        title: `Form 4: ${input.title}`.slice(0, 300),
        summary: input.summary?.slice(0, 500) ?? null,
        confidence: 0.9,
        evidenceJson: {
          formType: form,
          accessionNumber: input.accessionNumber ?? null,
          match: "form_insider",
        },
      });
    }

    // Material 8-K items — only with strong pattern evidence
    if (form === "8-K") {
      for (const rule of EIGHT_K_ITEM_RULES) {
        let matched: RegExpMatchArray | null = null;
        let matchedRe: RegExp | null = null;
        for (const re of rule.patterns) {
          matched = affirmativeMatch(text, re);
          if (matched) {
            matchedRe = re;
            break;
          }
        }
        if (!matched || !matchedRe) continue;
        const snippet = matched[0] ?? matchedRe.source;
        push({
          discriminant: rule.discriminant,
          category: rule.category,
          eventType: rule.eventType,
          severity: rule.severity,
          title: `8-K — ${rule.titleSuffix}`.slice(0, 300),
          summary: input.summary?.slice(0, 500) ?? rule.titleSuffix,
          confidence: 0.85,
          evidenceJson: {
            formType: "8-K",
            accessionNumber: input.accessionNumber ?? null,
            itemKey: rule.discriminant,
            matchedPattern: matchedRe.source,
            evidenceSnippet: String(snippet).slice(0, 240),
            match: "eight_k_item",
          },
        });
      }
    }
  } else {
    // Insufficient form metadata — only emit generic if text looks like SEC
    const looksSec =
      /\b(SEC|EDGAR|FORM\s+\d|8-K|10-K|10-Q|S-1|S-3|424B)\b/i.test(text) ||
      Boolean(input.rawNewsId?.startsWith("sec-"));
    if (!looksSec) return [];
    push({
      discriminant: "form",
      category: "filing",
      eventType: "sec_other",
      severity: "unknown",
      title: input.title.slice(0, 300),
      summary: input.summary?.slice(0, 500) ?? null,
      confidence: 0.4,
      evidenceJson: {
        formType: null,
        accessionNumber: input.accessionNumber ?? null,
        rawNewsId: input.rawNewsId ?? null,
        match: "generic_filing_fallback",
        note: "Form type not confidently resolved — generic filing event only",
      },
    });
  }

  return events;
}

/** True when this article/catalyst should run the Company Event classifier. */
export function shouldClassifyCompanyEvent(input: {
  source: string;
  rawNewsId?: string | null;
  headline?: string | null;
}): boolean {
  if (input.source === "SEC EDGAR") return true;
  if (input.rawNewsId?.startsWith("sec-")) return true;
  return false;
}
