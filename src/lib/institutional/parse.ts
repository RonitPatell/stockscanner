/**
 * Parse Form 13F information-table XML / HTML into holdings.
 * SEC value is in thousands — converted to USD.
 */

import {
  INSTITUTIONAL_ENGINE_VERSION,
  type Parsed13fFiling,
  type Parsed13fHolding,
} from "./types.ts";

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function tagText(block: string, tag: string): string | null {
  const re = new RegExp(
    `<${tag}(?:\\s[^>]*)?>\\s*([\\s\\S]*?)\\s*</${tag}>`,
    "i"
  );
  const m = block.match(re);
  if (!m) return null;
  return stripTags(m[1]!);
}

function extractBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`, "gi");
  return xml.match(re) ?? [];
}

function parseNumber(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[,$]/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function parseHoldingBlock(block: string): Parsed13fHolding {
  const valueThousands = parseNumber(tagText(block, "value"));
  const shares = parseNumber(tagText(block, "sshPrnamt"));
  const sshPrnamtType = tagText(block, "sshPrnamtType");
  const putCall = tagText(block, "putCall");
  const investmentDiscretion = tagText(block, "investmentDiscretion");

  return {
    issuerName: tagText(block, "nameOfIssuer"),
    titleOfClass: tagText(block, "titleOfClass"),
    cusip: tagText(block, "cusip"),
    shares:
      sshPrnamtType && /^PRN$/i.test(sshPrnamtType) ? shares : shares,
    valueUsd:
      valueThousands != null && Number.isFinite(valueThousands)
        ? valueThousands * 1000
        : null,
    putCall,
    investmentDiscretion,
    sshPrnamtType,
  };
}

/**
 * Parse 13F information table document (XML) and optional cover fields.
 */
export function parse13fInformationTable(
  xml: string,
  opts?: {
    filerCik?: string | null;
    filerName?: string | null;
    reportDate?: string | null;
  }
): Parsed13fFiling {
  const warnings: string[] = [];
  const trimmed = xml?.trim() ?? "";
  if (!trimmed) {
    return {
      version: INSTITUTIONAL_ENGINE_VERSION,
      filerCik: opts?.filerCik ?? null,
      filerName: opts?.filerName ?? null,
      reportDate: opts?.reportDate ?? null,
      holdings: [],
      parseWarnings: ["empty_document"],
    };
  }

  let reportDate =
    opts?.reportDate ||
    tagText(trimmed, "periodOfReport") ||
    tagText(trimmed, "reportCalendarOrQuarter");
  let filerName =
    opts?.filerName ||
    tagText(trimmed, "filingManager") ||
    tagText(trimmed, "name");
  // filingManager often nests <name>
  if (!opts?.filerName) {
    const mgr = extractBlocks(trimmed, "filingManager")[0];
    if (mgr) filerName = tagText(mgr, "name") || filerName;
  }

  let filerCik = opts?.filerCik ?? tagText(trimmed, "cik") ?? null;

  const infoBlocks = extractBlocks(trimmed, "infoTable");
  const holdings: Parsed13fHolding[] = [];
  for (const b of infoBlocks) {
    const h = parseHoldingBlock(b);
    // Skip empty rows
    if (!h.cusip && !h.issuerName && h.shares == null && h.valueUsd == null) {
      continue;
    }
    // Prefer equity shares; still keep puts/calls labeled
    holdings.push(h);
  }

  if (holdings.length === 0) {
    warnings.push("no_info_table_rows");
  }
  if (!reportDate) warnings.push("missing_report_date");

  return {
    version: INSTITUTIONAL_ENGINE_VERSION,
    filerCik,
    filerName: filerName || null,
    reportDate: reportDate || null,
    holdings,
    parseWarnings: warnings,
  };
}
