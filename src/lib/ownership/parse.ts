/**
 * Parse Schedule 13D/13G HTML or text cover-page fields.
 * Fail soft: missing % → unparseable (no invented ownership).
 */

import {
  OWNERSHIP_ENGINE_VERSION,
  type ParsedBeneficialOwnership,
} from "./types.ts";

function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ");
}

function parsePercent(raw: string): number | null {
  const m = raw.replace(/,/g, "").match(/(\d{1,3}(?:\.\d+)?)\s*%?/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

function parseShares(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  const m = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  // Reject tiny numbers that look like row labels (1–13) unless clearly large
  if (n > 0 && n < 100 && !/,\d{3}/.test(raw) && !/\d{4,}/.test(cleaned)) {
    return null;
  }
  return n;
}

function captureAfterLabel(text: string, labels: RegExp[]): string | null {
  for (const label of labels) {
    const m = text.match(label);
    if (!m) continue;
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 220);
    const line = after
      .split(/\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 1 && !/^\d+\.?$/.test(l));
    if (line) return line.replace(/^[:.\-\s]+/, "").trim();
  }
  return null;
}

function detectFormType(text: string, hint?: string | null): string | null {
  if (hint && /SC\s*13[DG]/i.test(hint)) {
    const norm = hint.toUpperCase().replace(/\s+/g, " ").trim();
    if (/13D\s*\/\s*A|13D\/A/.test(norm)) return "SC 13D/A";
    if (/13G\s*\/\s*A|13G\/A/.test(norm)) return "SC 13G/A";
    if (/13D/.test(norm)) return "SC 13D";
    if (/13G/.test(norm)) return "SC 13G";
  }
  if (/\bSCHEDULE\s+13D\/A\b|\bSC\s*13D\/A\b/i.test(text)) return "SC 13D/A";
  if (/\bSCHEDULE\s+13G\/A\b|\bSC\s*13G\/A\b/i.test(text)) return "SC 13G/A";
  if (/\bSCHEDULE\s+13D\b|\bSC\s*13D\b/i.test(text)) return "SC 13D";
  if (/\bSCHEDULE\s+13G\b|\bSC\s*13G\b/i.test(text)) return "SC 13G";
  return null;
}

/**
 * Extract beneficial ownership cover fields from filing HTML/text.
 */
export function parseBeneficialOwnershipDocument(
  raw: string,
  opts?: { formTypeHint?: string | null }
): ParsedBeneficialOwnership {
  const warnings: string[] = [];
  const evidence: string[] = [];

  if (!raw?.trim()) {
    return {
      filerName: null,
      filerCik: null,
      issuerName: null,
      tradingSymbol: null,
      percentOwned: null,
      sharesOwned: null,
      formType: opts?.formTypeHint ?? null,
      isAmendment: /\/A$/i.test(opts?.formTypeHint ?? ""),
      confidence: 0,
      parseStatus: "unparseable",
      evidenceSnippets: [],
      parseWarnings: ["empty_document"],
    };
  }

  const text = stripHtml(raw);
  const formType = detectFormType(text, opts?.formTypeHint);
  const isAmendment = Boolean(formType && /\/A$/i.test(formType));

  const filerName = captureAfterLabel(text, [
    /names?\s+of\s+reporting\s+persons?[^\n]{0,40}/i,
    /name\s+of\s+reporting\s+person[^\n]{0,40}/i,
    /reporting\s+person(?:\(s\))?[^\n]{0,20}:/i,
  ]);

  const issuerName = captureAfterLabel(text, [
    /name\s+of\s+issuer[^\n]{0,40}/i,
    /issuer\s+name[^\n]{0,20}:/i,
  ]);

  const tradingSymbol = (() => {
    const m = text.match(
      /title\s+of\s+class\s+of\s+securities[\s\S]{0,80}?trading\s+symbol[^\n]*\n?\s*([A-Z]{1,5})\b/i
    );
    if (m) return m[1]!.toUpperCase();
    const m2 = text.match(/\btrading\s+symbol[:\s]+([A-Z]{1,5})\b/i);
    return m2 ? m2[1]!.toUpperCase() : null;
  })();

  const filerCik = (() => {
    const m = text.match(/\bCIK[:\s#]*0*(\d{6,10})\b/i);
    return m ? m[1]! : null;
  })();

  // Percent of class — prefer row 13 style labels
  let percentOwned: number | null = null;
  const pctPatterns = [
    /percent\s+of\s+class\s+represented[^\n]{0,80}?(\d{1,3}(?:\.\d+)?)\s*%/i,
    /percent\s+of\s+class[^\n]{0,60}?(\d{1,3}(?:\.\d+)?)\s*%/i,
    /(\d{1,3}(?:\.\d+)?)\s*%\s+of\s+(?:the\s+)?(?:outstanding\s+)?(?:common\s+)?(?:stock|shares|class)/i,
    /beneficially\s+owns?[^\n]{0,60}?(\d{1,3}(?:\.\d+)?)\s*%/i,
  ];
  for (const re of pctPatterns) {
    const m = text.match(re);
    if (m) {
      percentOwned = parsePercent(m[1]!);
      if (percentOwned != null) {
        evidence.push(`percent:${percentOwned}`);
        break;
      }
    }
  }

  // Sometimes % is on the next line after the label
  if (percentOwned == null) {
    const label = text.match(
      /percent\s+of\s+class\s+represented\s+by\s+amount[^\n]*\n\s*([^\n]+)/i
    );
    if (label) {
      percentOwned = parsePercent(label[1]!);
      if (percentOwned != null) evidence.push(`percent_line:${percentOwned}`);
    }
  }

  let sharesOwned: number | null = null;
  const sharePatterns = [
    /aggregate\s+amount\s+beneficially\s+owned[^\n]{0,80}?([\d,]{3,})/i,
    /aggregate\s+amount\s+owned[^\n]{0,60}?([\d,]{3,})/i,
    /beneficially\s+owns?\s+([\d,]{3,})\s+shares/i,
  ];
  for (const re of sharePatterns) {
    const m = text.match(re);
    if (m) {
      sharesOwned = parseShares(m[1]!);
      if (sharesOwned != null) {
        evidence.push(`shares:${sharesOwned}`);
        break;
      }
    }
  }
  if (sharesOwned == null) {
    const label = text.match(
      /aggregate\s+amount\s+beneficially\s+owned[^\n]*\n\s*([^\n]+)/i
    );
    if (label) {
      sharesOwned = parseShares(label[1]!);
      if (sharesOwned != null) evidence.push(`shares_line:${sharesOwned}`);
    }
  }

  if (!filerName) warnings.push("missing_filer_name");
  if (percentOwned == null) warnings.push("missing_percent");
  if (sharesOwned == null) warnings.push("missing_shares");
  if (!formType) warnings.push("missing_form_type");

  let confidence = 0;
  if (filerName) confidence += 0.35;
  if (percentOwned != null) confidence += 0.4;
  if (sharesOwned != null) confidence += 0.15;
  if (formType) confidence += 0.1;

  let parseStatus: ParsedBeneficialOwnership["parseStatus"] = "ok";
  if (percentOwned == null && sharesOwned == null) {
    parseStatus = "unparseable";
    confidence = Math.min(confidence, 0.25);
  } else if (percentOwned == null || !filerName) {
    parseStatus = "partial";
  }

  return {
    filerName: filerName ? filerName.slice(0, 200) : null,
    filerCik,
    issuerName: issuerName ? issuerName.slice(0, 200) : null,
    tradingSymbol,
    percentOwned,
    sharesOwned,
    formType,
    isAmendment,
    confidence: Math.min(1, confidence),
    parseStatus,
    evidenceSnippets: evidence,
    parseWarnings: warnings,
  };
}

export { OWNERSHIP_ENGINE_VERSION };
