/**
 * Bounded per-CIK SEC submissions index — not a second parser.
 * Used by hydration to feed existing Form 4 / ownership / filings / dilution persist.
 */

import { SEC_USER_AGENT, waitForSecPermit } from "../ingest/sec-politeness.ts";
import { isAllowedSecDocumentUrl } from "../ingest/sec-url.ts";
import { cikUnpadded, normalizeCik } from "../company-identity/normalize.ts";

export type CompanyFilingRef = {
  form: string;
  accessionNumber: string;
  filingDate: string | null;
  primaryDocument: string | null;
  sourceUrl: string;
};

export function submissionsUrlForCik(cik: string): string {
  const padded = normalizeCik(cik) ?? cik;
  return `https://data.sec.gov/submissions/CIK${padded}.json`;
}

export function documentUrlForFiling(opts: {
  cik: string;
  accessionNumber: string;
  primaryDocument?: string | null;
}): string {
  const cikNum = cikUnpadded(normalizeCik(opts.cik) ?? opts.cik);
  const nodash = opts.accessionNumber.replace(/-/g, "");
  const doc = opts.primaryDocument?.replace(/^.*\//, "") || "";
  if (doc) {
    return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${nodash}/${doc}`;
  }
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${nodash}/`;
}

export function parseSubmissionsRecent(json: unknown, cik: string, limit = 80): CompanyFilingRef[] {
  if (!json || typeof json !== "object") return [];
  const filings = (json as { filings?: { recent?: Record<string, unknown> } }).filings
    ?.recent;
  if (!filings) return [];
  const forms = Array.isArray(filings.form) ? filings.form.map(String) : [];
  const acc = Array.isArray(filings.accessionNumber)
    ? filings.accessionNumber.map(String)
    : [];
  const dates = Array.isArray(filings.filingDate) ? filings.filingDate.map(String) : [];
  const docs = Array.isArray(filings.primaryDocument)
    ? filings.primaryDocument.map(String)
    : [];
  const out: CompanyFilingRef[] = [];
  const n = Math.min(limit, forms.length, acc.length);
  for (let i = 0; i < n; i++) {
    const accessionNumber = acc[i]!;
    const form = forms[i]!;
    const primaryDocument = docs[i] || null;
    out.push({
      form,
      accessionNumber,
      filingDate: dates[i] || null,
      primaryDocument,
      sourceUrl: documentUrlForFiling({ cik, accessionNumber, primaryDocument }),
    });
  }
  return out;
}

export function selectFilingsForHydration(
  refs: CompanyFilingRef[],
  bounds = { form4: 8, periodic: 4, ownership: 4, capital: 6 }
): {
  form4: CompanyFilingRef[];
  periodic: CompanyFilingRef[];
  ownership: CompanyFilingRef[];
  capital: CompanyFilingRef[];
} {
  const form4: CompanyFilingRef[] = [];
  const periodic: CompanyFilingRef[] = [];
  const ownership: CompanyFilingRef[] = [];
  const capital: CompanyFilingRef[] = [];
  for (const r of refs) {
    const f = r.form.toUpperCase().replace(/\s+/g, "");
    if (/^4(\/A)?$/.test(f) && form4.length < bounds.form4) form4.push(r);
    else if (/^10-Q|^10-K|^10Q|^10K/.test(f) && periodic.length < bounds.periodic) {
      periodic.push(r);
    } else if (/^SC13[DG]/.test(f) && ownership.length < bounds.ownership) {
      ownership.push(r);
    } else if (
      /^(S-3|S-1|424B|EFFECT)/.test(f) &&
      capital.length < bounds.capital
    ) {
      capital.push(r);
    }
  }
  return { form4, periodic, ownership, capital };
}

export async function fetchCompanySubmissions(
  cik: string
): Promise<CompanyFilingRef[] | null> {
  const ok = await waitForSecPermit(2_500);
  if (!ok) return null;
  const url = submissionsUrlForCik(cik);
  if (!isAllowedSecDocumentUrl(url)) return null;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": SEC_USER_AGENT,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return parseSubmissionsRecent(json, cik);
  } catch {
    return null;
  }
}
