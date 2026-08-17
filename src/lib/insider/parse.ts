/**
 * Parse SEC Form 4 ownershipDocument XML into structured transactions.
 * Hand-rolled tag extraction (no XML dependency) — fixtures drive correctness.
 */

import {
  classifyForm4Transaction,
  computeHoldingChange,
  computeTransactionValue,
  normalizeTransactionCode,
} from "./classify.ts";
import { buildInsiderSummary } from "./summary.ts";
import {
  INSIDER_ENGINE_VERSION,
  type Form4ParseResult,
  type ParsedInsiderTransaction,
} from "./types.ts";

function tagText(xml: string, tag: string): string | null {
  const re = new RegExp(
    `<${tag}(?:\\s[^>]*)?>\\s*([\\s\\S]*?)\\s*</${tag}>`,
    "i"
  );
  const m = xml.match(re);
  if (!m) return null;
  return unwrapValue(m[1]!.trim());
}

/** Prefer <value>...</value> when present; else strip nested tags. */
function unwrapValue(inner: string): string {
  const v = inner.match(/<value(?:\s[^>]*)?>\s*([\s\S]*?)\s*<\/value>/i);
  if (v) return stripTags(v[1]!).trim();
  return stripTags(inner).trim();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function bool01(raw: string | null): boolean | null {
  if (raw == null || raw === "") return null;
  const t = raw.trim().toLowerCase();
  if (t === "1" || t === "true" || t === "yes") return true;
  if (t === "0" || t === "false" || t === "no") return false;
  return null;
}

function parseNumber(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const cleaned = raw.replace(/[,$]/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned.toLowerCase() === "n/a") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseAd(raw: string | null): "A" | "D" | null {
  if (!raw) return null;
  const c = raw.trim().toUpperCase().charAt(0);
  return c === "A" || c === "D" ? c : null;
}

function parseDirect(raw: string | null): boolean | null {
  if (!raw) return null;
  const c = raw.trim().toUpperCase().charAt(0);
  if (c === "D") return true;
  if (c === "I") return false;
  return null;
}

function extractBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`, "gi");
  return xml.match(re) ?? [];
}

function parseFootnotes(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const block of extractBlocks(xml, "footnote")) {
    const id = block.match(/id=["']([^"']+)["']/i)?.[1] ?? null;
    const text = stripTags(block.replace(/^<footnote[^>]*>/i, "").replace(/<\/footnote>$/i, ""));
    if (id && text) out[id] = text;
  }
  return out;
}

function detect10b51(opts: {
  transactionXml: string;
  footnotes: Record<string, string>;
  footnoteIds: string[];
  fullXml: string;
}): boolean | null {
  const affirmative = tagText(opts.transactionXml, "affirmativeTradingArrangement");
  if (affirmative != null) {
    const b = bool01(affirmative);
    if (b === true) return true;
    if (b === false) return false;
  }

  const remarks = tagText(opts.fullXml, "remarks") ?? "";
  const blob = [
    remarks,
    ...opts.footnoteIds.map((id) => opts.footnotes[id] ?? ""),
    ...Object.values(opts.footnotes),
  ]
    .join(" ")
    .toLowerCase();

  if (
    /\b10\s*b\s*[- ]?\s*5\s*[- ]?\s*1\b/.test(blob) ||
    /\brule\s*10b5-1\b/.test(blob) ||
    /\baffirmative\s+trading\s+arrangement\b/.test(blob)
  ) {
    return true;
  }
  return null;
}

function footnoteRefs(block: string): string[] {
  const ids: string[] = [];
  const re = /footnoteId=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    ids.push(m[1]!);
  }
  return [...new Set(ids)];
}

function parseOneTransaction(
  block: string,
  ctx: {
    ownerName: string;
    ownerCik: string | null;
    isDirector: boolean | null;
    isOfficer: boolean | null;
    isTenPercent: boolean | null;
    officerTitle: string | null;
    issuerName: string | null;
    issuerCik: string | null;
    tradingSymbol: string | null;
    footnotes: Record<string, string>;
    fullXml: string;
  }
): ParsedInsiderTransaction {
  const coding = extractBlocks(block, "transactionCoding")[0] ?? block;
  const amounts = extractBlocks(block, "transactionAmounts")[0] ?? block;
  const post = extractBlocks(block, "postTransactionAmounts")[0] ?? block;
  const nature = extractBlocks(block, "ownershipNature")[0] ?? block;

  const transactionCode = normalizeTransactionCode(
    tagText(coding, "transactionCode")
  );
  const acquiredDisposed = parseAd(
    tagText(amounts, "transactionAcquiredDisposedCode")
  );
  const shares = parseNumber(tagText(amounts, "transactionShares"));
  const pricePerShare = parseNumber(tagText(amounts, "transactionPricePerShare"));
  const sharesOwnedAfter = parseNumber(
    tagText(post, "sharesOwnedFollowingTransaction")
  );
  const isDirect = parseDirect(tagText(nature, "directOrIndirectOwnership"));
  const securityTitle = tagText(block, "securityTitle");
  const transactionDate = tagText(block, "transactionDate");
  const footnoteIds = footnoteRefs(block);

  const classification = classifyForm4Transaction({
    transactionCode,
    acquiredDisposed,
  });
  const transactionValue = computeTransactionValue(shares, pricePerShare);
  const holdingChange = computeHoldingChange({
    shares,
    acquiredDisposed,
    isDirect,
    sharesOwnedAfter,
  });
  const is10b51 = detect10b51({
    transactionXml: block,
    footnotes: ctx.footnotes,
    footnoteIds,
    fullXml: ctx.fullXml,
  });

  const base: ParsedInsiderTransaction = {
    ownerName: ctx.ownerName,
    ownerCik: ctx.ownerCik,
    isDirector: ctx.isDirector,
    isOfficer: ctx.isOfficer,
    isTenPercent: ctx.isTenPercent,
    officerTitle: ctx.officerTitle,
    issuerName: ctx.issuerName,
    issuerCik: ctx.issuerCik,
    tradingSymbol: ctx.tradingSymbol,
    transactionDate,
    transactionCode,
    acquiredDisposed,
    shares,
    pricePerShare,
    transactionValue,
    sharesOwnedAfter,
    isDirect,
    holdingChange,
    securityTitle,
    classification,
    is10b51,
    summaryText: "",
    footnoteIds,
    evidenceSnippets: [],
  };
  base.summaryText = buildInsiderSummary(base);
  if (transactionCode) {
    base.evidenceSnippets.push(`transactionCode=${transactionCode}`);
  }
  if (acquiredDisposed) {
    base.evidenceSnippets.push(`acquiredDisposed=${acquiredDisposed}`);
  }
  return base;
}

/**
 * Parse Form 4 ownership XML. Accepts full document or ownershipDocument fragment.
 */
export function parseForm4Xml(
  xml: string,
  opts?: { accessionNumber?: string | null }
): Form4ParseResult {
  const warnings: string[] = [];
  const trimmed = xml?.trim() ?? "";
  if (!trimmed) {
    return {
      version: INSIDER_ENGINE_VERSION,
      accessionNumber: opts?.accessionNumber ?? null,
      transactions: [],
      footnotes: {},
      parseWarnings: ["empty_xml"],
    };
  }

  if (!/<ownershipDocument[\s>]/i.test(trimmed) && !/<nonDerivativeTransaction[\s>]/i.test(trimmed)) {
    warnings.push("missing_ownership_document_root");
  }

  const footnotes = parseFootnotes(trimmed);
  const issuerBlock = extractBlocks(trimmed, "issuer")[0] ?? "";
  const issuerName = tagText(issuerBlock, "issuerName");
  const issuerCik = tagText(issuerBlock, "issuerCik");
  const tradingSymbol = tagText(issuerBlock, "issuerTradingSymbol");

  const ownerBlock = extractBlocks(trimmed, "reportingOwner")[0] ?? "";
  const ownerId = extractBlocks(ownerBlock, "reportingOwnerId")[0] ?? ownerBlock;
  const ownerRel =
    extractBlocks(ownerBlock, "reportingOwnerRelationship")[0] ?? ownerBlock;
  const ownerName =
    tagText(ownerId, "rptOwnerName") ||
    tagText(ownerBlock, "rptOwnerName") ||
    "Unknown reporting person";
  const ownerCik = tagText(ownerId, "rptOwnerCik");
  const isDirector = bool01(tagText(ownerRel, "isDirector"));
  const isOfficer = bool01(tagText(ownerRel, "isOfficer"));
  const isTenPercent = bool01(tagText(ownerRel, "isTenPercentOwner"));
  const officerTitle = tagText(ownerRel, "officerTitle");

  const ctx = {
    ownerName,
    ownerCik,
    isDirector,
    isOfficer,
    isTenPercent,
    officerTitle,
    issuerName,
    issuerCik,
    tradingSymbol,
    footnotes,
    fullXml: trimmed,
  };

  const nonDeriv = extractBlocks(trimmed, "nonDerivativeTransaction");
  const deriv = extractBlocks(trimmed, "derivativeTransaction");
  const transactions: ParsedInsiderTransaction[] = [];

  for (const block of nonDeriv) {
    transactions.push(parseOneTransaction(block, ctx));
  }
  for (const block of deriv) {
    // Derivative rows often use underlying shares — still classify by code.
    transactions.push(parseOneTransaction(block, ctx));
  }

  if (transactions.length === 0) {
    warnings.push("no_transactions_found");
  }

  return {
    version: INSIDER_ENGINE_VERSION,
    accessionNumber: opts?.accessionNumber ?? null,
    transactions,
    footnotes,
    parseWarnings: warnings,
  };
}
