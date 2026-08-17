/**
 * Extract Risk Factors / MD&A / Liquidity sections from normalized filing text.
 * Deterministic heading heuristics — fail soft when missing.
 */

import { normalizeFilingHtml } from "./normalize.ts";
import type { ExtractedSection, FilingSectionKey } from "./types.ts";

const SECTION_META: Record<
  FilingSectionKey,
  { title: string; start: RegExp[]; end: RegExp[] }
> = {
  risk_factors: {
    title: "Risk Factors",
    start: [
      /^item\s*1a[\.\s:—-]+.*risk\s+factors?/im,
      /^item\s*1a[\.\s:—-]*$/im,
      /^risk\s+factors?\s*$/im,
    ],
    end: [
      /^item\s*1b[\.\s:—-]/im,
      /^item\s*2[\.\s:—-]/im,
      /^unresolved\s+staff\s+comments/im,
      /^item\s*3[\.\s:—-]/im,
    ],
  },
  mda: {
    title: "MD&A",
    start: [
      /^item\s*7[\.\s:—-]+.*management.?s?\s+discussion/im,
      /^item\s*2[\.\s:—-]+.*management.?s?\s+discussion/im,
      /^management.?s?\s+discussion\s+and\s+analysis/im,
    ],
    end: [
      /^item\s*7a[\.\s:—-]/im,
      /^item\s*8[\.\s:—-]/im,
      /^item\s*3[\.\s:—-]/im,
      /^item\s*4[\.\s:—-]/im,
      /^quantitative\s+and\s+qualitative\s+disclosures\s+about\s+market\s+risk/im,
      /^financial\s+statements/im,
    ],
  },
  liquidity: {
    title: "Liquidity / Capital Resources",
    start: [
      /^liquidity\s+and\s+capital\s+resources?\s*$/im,
      /^liquidity\s+and\s+capital\s+resources?[\.\s:—-]/im,
      /^capital\s+resources?\s+and\s+liquidity/im,
    ],
    end: [
      /^results\s+of\s+operations/im,
      /^critical\s+accounting/im,
      /^contractual\s+obligations/im,
      /^off[- ]balance[- ]sheet/im,
      /^item\s*7a[\.\s:—-]/im,
      /^item\s*8[\.\s:—-]/im,
      /^item\s*3[\.\s:—-]/im,
      /^quantitative\s+and\s+qualitative/im,
    ],
  },
};

function findStart(text: string, patterns: RegExp[]): number {
  let best = -1;
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.index != null && (best < 0 || m.index < best)) best = m.index;
  }
  return best;
}

function findEnd(text: string, from: number, patterns: RegExp[]): number {
  const slice = text.slice(from + 1);
  let best = -1;
  for (const re of patterns) {
    const m = slice.match(re);
    if (m?.index != null && (best < 0 || m.index < best)) best = m.index;
  }
  if (best < 0) return Math.min(text.length, from + 120_000);
  return from + 1 + best;
}

export function extractFilingSections(
  htmlOrText: string
): ExtractedSection[] {
  const text = /<html|<body|<div|<p\b/i.test(htmlOrText)
    ? normalizeFilingHtml(htmlOrText)
    : htmlOrText.replace(/\r/g, "").trim();

  const out: ExtractedSection[] = [];
  for (const key of Object.keys(SECTION_META) as FilingSectionKey[]) {
    const meta = SECTION_META[key];
    const start = findStart(text, meta.start);
    if (start < 0) {
      out.push({
        sectionKey: key,
        sectionTitle: meta.title,
        text: "",
        found: false,
      });
      continue;
    }
    const end = findEnd(text, start, meta.end);
    let body = text.slice(start, end).trim();
    // Cap extreme size
    if (body.length > 200_000) body = body.slice(0, 200_000);
    out.push({
      sectionKey: key,
      sectionTitle: meta.title,
      text: body,
      found: body.length >= 80,
    });
  }
  return out;
}

export function sectionTitleFor(key: FilingSectionKey): string {
  return SECTION_META[key].title;
}
