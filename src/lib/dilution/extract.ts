import type {
  DilutionCapacityKind,
  DilutionEstimateLabel,
  DilutionExtractionInput,
  DilutionExtractionResult,
  DilutionInstrumentStatus,
  DilutionInstrumentType,
} from "./types.ts";

function textOf(input: DilutionExtractionInput): string {
  return [input.title, input.summary, input.body].filter(Boolean).join("\n");
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "").toUpperCase();
  const m = cleaned.match(/^([\d.]+)(K|M|B|MM|BN)?$/i);
  if (!m) {
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  let n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const suf = (m[2] || "").toUpperCase();
  if (suf === "K") n *= 1e3;
  else if (suf === "M" || suf === "MM") n *= 1e6;
  else if (suf === "B" || suf === "BN") n *= 1e9;
  return n;
}

/** Extract first monetary amount near a keyword window. */
function findDollars(text: string, near: RegExp): number | null {
  const idx = text.search(near);
  if (idx < 0) return null;
  const window = text.slice(Math.max(0, idx - 40), idx + 120);
  const m = window.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(million|billion|m|b|mm|bn)?/i);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || "").toLowerCase();
  if (unit.startsWith("b")) n *= 1e9;
  else if (unit.startsWith("m")) n *= 1e6;
  return n;
}

function findShares(text: string, near?: RegExp): number | null {
  const src = near
    ? (() => {
        const idx = text.search(near);
        if (idx < 0) return text;
        return text.slice(Math.max(0, idx - 30), idx + 140);
      })()
    : text;
  const m = src.match(
    /([\d,]+(?:\.\d+)?)\s*(million|m|mm)?\s*(shares?|warrants?)/i
  );
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || "").toLowerCase();
  if (unit.startsWith("m")) n *= 1e6;
  return n;
}

function findPrice(text: string): number | null {
  const m = text.match(
    /(?:offer(?:ing)?\s+price|purchase\s+price|exercise\s+price|priced?\s+at)\s*(?:of\s*)?\$?\s*([\d]+(?:\.\d+)?)/i
  );
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function findExercisePrice(text: string): number | null {
  const m = text.match(
    /exercise\s+price\s*(?:of\s*)?\$?\s*([\d]+(?:\.\d+)?)/i
  );
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function snippet(text: string, re: RegExp, max = 180): string | null {
  const m = text.match(re);
  if (!m || m.index == null) return null;
  const start = Math.max(0, m.index - 20);
  return text.slice(start, start + max).replace(/\s+/g, " ").trim();
}

function classifyTypes(
  formType: string | null | undefined,
  text: string
): DilutionInstrumentType[] {
  const types: DilutionInstrumentType[] = [];
  const form = (formType || "").toUpperCase().replace(/\s+/g, "");
  const t = text;

  if (/\/A$/i.test(form) || /\bamendment\b/i.test(t)) types.push("AMENDMENT");

  if (/^S-1/i.test(form) || /\bform\s*s-1\b/i.test(t)) types.push("S1_REGISTRATION");
  if (/^S-3/i.test(form) || /\bform\s*s-3\b|\bshelf\s+registration\b/i.test(t))
    types.push("S3_SHELF");
  if (/424B5/i.test(form) || /\b424\s*b\s*5\b|\bprospectus\s+supplement\b/i.test(t))
    types.push("PROSPECTUS_424B5");

  if (/\bregistered\s+direct\b/i.test(t)) types.push("REGISTERED_DIRECT");
  if (
    /\bat[\s-]?the[\s-]?market\b|\batm\s+(offering|program|facility|agreement)\b|\bsales\s+agreement\b.*\batm\b/i.test(
      t
    )
  ) {
    types.push("ATM_PROGRAM");
  }
  if (
    /\bequity\s+purchase\s+agreement\b|\bpurchase\s+agreement\b.*\b(common\s+stock|shares)\b|\bsepaa\b|\beLOC\b/i.test(
      t
    )
  ) {
    types.push("EQUITY_PURCHASE_AGREEMENT");
  }
  if (/\bconvertible\s+(senior\s+)?notes?\b|\bconvertible\s+debentures?\b/i.test(t)) {
    types.push("CONVERTIBLE_NOTE");
  }
  if (/\bconvertible\s+preferred\b/i.test(t)) types.push("CONVERTIBLE_PREFERRED");
  if (/\brepriced?\s+warrants?\b|\bwarrant\s+reprice/i.test(t)) types.push("WARRANT_REPRICE");
  else if (/\bwarrants?\s+(to\s+purchase|outstanding|exercisable)\b|\bseries\s+\w+\s+warrants?\b/i.test(t)) {
    types.push("WARRANT");
  }
  if (/\breverse\s+stock\s+split\b|\breverse\s+split\b/i.test(t)) types.push("REVERSE_SPLIT");
  if (/\beffective\b.*\bregistration\b|\bregistration\s+statement\s+.*\beffective\b/i.test(t)) {
    types.push("EFFECTIVE_REGISTRATION");
  }
  if (
    /\bshares?\s+outstanding\b.*\b(increased|decreased|changed|now\s+total)\b|\bas\s+adjusted\s+shares?\s+outstanding\b/i.test(
      t
    )
  ) {
    types.push("SHARES_OUTSTANDING_CHANGE");
  }
  if (
    /\bterminat(ed|es|ion)\b.*\b(atm|facility|sales\s+agreement|equity\s+line|purchase\s+agreement)\b|\bterminated\s+facility\b/i.test(
      t
    )
  ) {
    types.push("TERMINATED_FACILITY");
  }

  // Dedupe preserving order
  return [...new Set(types)];
}

function statusFromText(text: string, type: DilutionInstrumentType): DilutionInstrumentStatus {
  if (type === "TERMINATED_FACILITY" || /\bterminat/i.test(text)) return "terminated";
  if (/\bexhaust(ed|ion)\b|\bfully\s+utilized\b|\bno\s+remaining\s+capacity\b/i.test(text)) {
    return "exhausted";
  }
  if (/\bexpir(ed|ation)\b|\bexpired\s+warrants?\b/i.test(text)) return "expired";
  if (
    type === "EFFECTIVE_REGISTRATION" ||
    /\beffective\b/i.test(text) ||
    /\bcurrently\s+effective\b/i.test(text)
  ) {
    return "active";
  }
  if (/\bentered\s+into\b|\bestablish(ed|es)\b|\blaunch/i.test(text)) return "active";
  return "unknown";
}

function capacityKindFor(type: DilutionInstrumentType, text: string): DilutionCapacityKind {
  if (type === "ATM_PROGRAM") {
    if (/\bsold\b|\bissued\b|\bcompleted\s+sales?\b/i.test(text)) return "confirmed_issuance";
    return "atm_availability";
  }
  if (type === "S1_REGISTRATION" || type === "S3_SHELF" || type === "EFFECTIVE_REGISTRATION") {
    return "registration_capacity";
  }
  if (
    type === "REGISTERED_DIRECT" ||
    type === "PROSPECTUS_424B5" ||
    type === "EQUITY_PURCHASE_AGREEMENT"
  ) {
    if (/\bagreement\s+to\s+sell\b|\bannounced\s+.*\boffering\b|\bpricing\b/i.test(text)) {
      return "announced_sale";
    }
    return "announced_sale";
  }
  return "other";
}

/**
 * Compute dilution % only when maxShares and sharesOutstanding are both reliable.
 * Never invent a percentage from dollars alone or from a bad denominator.
 */
export function computePotentialDilutionPct(opts: {
  maxShares: number | null;
  sharesOutstanding: number | null;
  capacityKind: DilutionCapacityKind;
}): { pct: number | null; label: DilutionEstimateLabel; missing: string[] } {
  const missing: string[] = [];
  if (opts.maxShares == null || !(opts.maxShares > 0)) {
    missing.push("maxShares");
  }
  if (opts.sharesOutstanding == null || !(opts.sharesOutstanding > 0)) {
    missing.push("sharesOutstanding");
  }
  if (missing.length) {
    return {
      pct: null,
      label: opts.capacityKind === "registration_capacity" ? "capacity_only" : "unavailable",
      missing,
    };
  }
  // Guard absurd denominators / numerators
  const shares = opts.maxShares!;
  const denom = opts.sharesOutstanding!;
  if (shares / denom > 50) {
    // Unreliable — likely wrong unit parse
    return { pct: null, label: "unavailable", missing: ["unreliable_ratio"] };
  }
  const pct = Math.round((shares / denom) * 1000) / 10;
  const label: DilutionEstimateLabel =
    opts.capacityKind === "registration_capacity" || opts.capacityKind === "atm_availability"
      ? "capacity_only"
      : opts.capacityKind === "announced_sale" || opts.capacityKind === "confirmed_issuance"
        ? "estimate"
        : "estimate";
  return { pct, label, missing: [] };
}

/**
 * Extract one or more dilution instruments from filing title/summary/body.
 * Pure function — fixture-friendly.
 */
export function extractDilutionInstruments(
  input: DilutionExtractionInput
): DilutionExtractionResult[] {
  const text = textOf(input);
  const types = classifyTypes(input.formType, text);
  if (types.length === 0) return [];

  const results: DilutionExtractionResult[] = [];

  for (const instrumentType of types) {
    // Amendments alone without a capital instrument — still record
    if (instrumentType === "AMENDMENT" && types.length > 1) {
      // Keep amendment as secondary tag on primary instruments via structured section
      continue;
    }

    const evidence: string[] = [];
    const sections: Record<string, string> = {};
    const missingFields: string[] = [];

    const snip = snippet(text, new RegExp(instrumentType.split("_")[0], "i")) ||
      snippet(text, /\b(offering|atm|warrant|convertible|shelf|prospectus|reverse\s+split)\b/i);
    if (snip) evidence.push(snip);

    let maxShares = findShares(text, /\b(up\s+to|aggregate\s+of|maximum\s+of)\b/i);
    if (maxShares == null) maxShares = findShares(text);
    let maxDollars = findDollars(text, /\b(aggregate\s+offering|up\s+to|maximum\s+aggregate)\b/i);
    if (maxDollars == null) maxDollars = findDollars(text, /\$/);
    const offerPrice = findPrice(text);

    let warrantCount: number | null = null;
    let warrantExercisePrice: number | null = null;
    if (instrumentType === "WARRANT" || instrumentType === "WARRANT_REPRICE") {
      warrantCount = findShares(text, /\bwarrant/i);
      warrantExercisePrice = findExercisePrice(text) ?? offerPrice;
      if (warrantCount == null) missingFields.push("warrantCount");
      if (warrantExercisePrice == null) missingFields.push("warrantExercisePrice");
    }

    if (instrumentType === "ATM_PROGRAM" || instrumentType === "S3_SHELF") {
      if (maxDollars == null && maxShares == null) missingFields.push("maxDollars_or_maxShares");
    }
    if (
      instrumentType === "REGISTERED_DIRECT" ||
      instrumentType === "PROSPECTUS_424B5"
    ) {
      if (maxShares == null && maxDollars == null) missingFields.push("size");
      if (offerPrice == null) missingFields.push("offerPrice");
    }

    const capacityKind = capacityKindFor(instrumentType, text);
    const status = statusFromText(text, instrumentType);
    const denom =
      input.sharesOutstanding != null && input.sharesOutstanding > 0
        ? input.sharesOutstanding
        : null;
    if (denom == null) missingFields.push("sharesOutstanding");

    const dil = computePotentialDilutionPct({
      maxShares,
      sharesOutstanding: denom,
      capacityKind,
    });
    for (const m of dil.missing) {
      if (!missingFields.includes(m)) missingFields.push(m);
    }

    // Confidence: form match + evidence - missing fields
    let confidence = 40;
    if (input.formType) confidence += 20;
    if (evidence.length) confidence += 15;
    if (maxShares != null || maxDollars != null) confidence += 10;
    if (input.accessionNumber) confidence += 5;
    confidence -= missingFields.length * 4;
    if (types.includes("AMENDMENT")) {
      sections.amendment = "Filing appears amended (/A or amendment language)";
      confidence -= 5;
    }
    confidence = Math.max(5, Math.min(95, confidence));

    const needsManualReview =
      confidence < 40 ||
      (types.includes("AMENDMENT") && types.length > 1) ||
      (maxShares != null && denom != null && maxShares / denom > 10);

    if (input.formType) sections.formType = input.formType;
    if (capacityKind) sections.capacityKind = capacityKind;

    results.push({
      instrumentType,
      status,
      maxShares,
      maxDollars,
      offerPrice,
      warrantCount,
      warrantExercisePrice,
      potentialDilutionPct: dil.pct,
      estimateLabel: dil.label,
      capacityKind,
      confidence,
      missingFields: [...new Set(missingFields)],
      evidenceSnippets: evidence.slice(0, 5),
      structuredSections: sections,
      sharesOutstandingDenom: denom,
      needsManualReview,
      conflictHint: needsManualReview ? "Low confidence or extreme ratio — review" : undefined,
    });
  }

  // If only AMENDMENT matched
  if (results.length === 0 && types.includes("AMENDMENT")) {
    results.push({
      instrumentType: "AMENDMENT",
      status: "unknown",
      maxShares: null,
      maxDollars: null,
      offerPrice: null,
      warrantCount: null,
      warrantExercisePrice: null,
      potentialDilutionPct: null,
      estimateLabel: "unavailable",
      capacityKind: "other",
      confidence: 50,
      missingFields: ["underlying_instrument"],
      evidenceSnippets: [snippet(text, /\bamendment\b/i) || input.title.slice(0, 160)],
      structuredSections: { note: "Amendment detected without clear capital instrument" },
      sharesOutstandingDenom: input.sharesOutstanding ?? null,
      needsManualReview: true,
      conflictHint: "Amendment without clear instrument type",
    });
  }

  return results;
}

/** Parse accession from common EDGAR URL patterns. */
export function parseAccessionFromUrl(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(\d{10}-\d{2}-\d{6})/);
  return m?.[1] ?? null;
}

export function parseFormFromRawNewsId(rawNewsId?: string | null): string | null {
  if (!rawNewsId) return null;
  const m = rawNewsId.match(
    /^sec-(nt-10-q|nt-10-k|10-q|10-k|424b5|s-1\/a|s-3\/a|s-1|s-3|8-k|def-14a|effect|sc-13d\/a|sc-13g\/a|sc-13d|sc-13g|13f-hr|form3|form5|form144|3|4|5|144)(?:-|$)/i
  );
  if (!m) return null;
  const slug = m[1].toLowerCase();
  const map: Record<string, string> = {
    "8-k": "8-K",
    "10-q": "10-Q",
    "10-k": "10-K",
    "nt-10-q": "NT 10-Q",
    "nt-10-k": "NT 10-K",
    "s-1": "S-1",
    "s-1/a": "S-1/A",
    "s-3": "S-3",
    "s-3/a": "S-3/A",
    "424b5": "424B5",
    effect: "EFFECT",
    "def-14a": "DEF 14A",
    "3": "3",
    form3: "3",
    "4": "4",
    "5": "5",
    form5: "5",
    "144": "144",
    form144: "144",
    "sc-13d": "SC 13D",
    "sc-13d/a": "SC 13D/A",
    "sc-13g": "SC 13G",
    "sc-13g/a": "SC 13G/A",
    "13f-hr": "13F-HR",
  };
  return map[slug] ?? m[1].toUpperCase();
}
