/**
 * Fetch Form 4 ownership XML via SEC EDGAR (polite + fail-soft).
 */

import { SEC_USER_AGENT, waitForSecPermit } from "../ingest/sec-politeness.ts";
import { parseAccessionFromUrl } from "../dilution/extract.ts";

function accessionNoDashes(accession: string): string {
  return accession.replace(/-/g, "");
}

function cikFromAccessionOrUrl(
  cik: string | null | undefined,
  sourceUrl: string | null | undefined,
  accession: string
): string | null {
  if (cik && /^\d+$/.test(cik.replace(/^0+/, "") || "0")) {
    return String(parseInt(cik, 10));
  }
  if (sourceUrl) {
    const m = sourceUrl.match(/\/data\/(\d+)\//i);
    if (m) return m[1]!;
  }
  // Accession issuer prefix is not always CIK — prefer URL/cik.
  const prefix = accession.split("-")[0];
  if (prefix && /^\d+$/.test(prefix)) return String(parseInt(prefix, 10));
  return null;
}

async function secGet(url: string): Promise<string | null> {
  const ok = await waitForSecPermit(2_500);
  if (!ok) return null;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": SEC_USER_AGENT,
        Accept: "application/json, application/xml, text/xml, text/html, */*",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

type IndexDoc = {
  name?: string;
  type?: string;
  documentUrl?: string;
};

/**
 * Resolve primary Form 4 XML URL from filing index.json when possible.
 */
export async function resolveForm4XmlUrl(opts: {
  cik?: string | null;
  accessionNumber?: string | null;
  sourceUrl?: string | null;
}): Promise<string | null> {
  const accession =
    opts.accessionNumber || parseAccessionFromUrl(opts.sourceUrl) || null;
  if (!accession) {
    // Atom sometimes links directly to a document
    if (opts.sourceUrl && /\.xml($|\?)/i.test(opts.sourceUrl)) {
      return opts.sourceUrl;
    }
    return null;
  }

  const cik = cikFromAccessionOrUrl(opts.cik, opts.sourceUrl, accession);
  if (!cik) {
    if (opts.sourceUrl && /\.xml($|\?)/i.test(opts.sourceUrl)) {
      return opts.sourceUrl;
    }
    return null;
  }

  const nodash = accessionNoDashes(accession);
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${nodash}/index.json`;
  const raw = await secGet(indexUrl);
  if (raw) {
    try {
      const json = JSON.parse(raw) as {
        directory?: { item?: IndexDoc[] | IndexDoc };
      };
      const items = json.directory?.item;
      const list = Array.isArray(items) ? items : items ? [items] : [];
      const xmlCandidates = list.filter(
        (d) =>
          typeof d.name === "string" &&
          /\.xml$/i.test(d.name) &&
          !/xsl/i.test(d.name)
      );
      const primary =
        xmlCandidates.find((d) => /primary_doc\.xml/i.test(d.name!)) ||
        xmlCandidates.find((d) => String(d.type ?? "") === "4") ||
        xmlCandidates[0];
      if (primary?.name) {
        return `https://www.sec.gov/Archives/edgar/data/${cik}/${nodash}/${primary.name}`;
      }
    } catch {
      /* fall through */
    }
  }

  // Common fallbacks
  const fallbacks = [
    `https://www.sec.gov/Archives/edgar/data/${cik}/${nodash}/primary_doc.xml`,
    `https://www.sec.gov/Archives/edgar/data/${cik}/${nodash}/xslF345X05/primary_doc.xml`,
    `https://www.sec.gov/Archives/edgar/data/${cik}/${nodash}/xslF345X03/primary_doc.xml`,
  ];
  for (const url of fallbacks) {
    const body = await secGet(url);
    if (body && /ownershipDocument/i.test(body)) return url;
  }

  if (opts.sourceUrl && /\.xml($|\?)/i.test(opts.sourceUrl)) {
    return opts.sourceUrl;
  }
  return null;
}

/** Fetch Form 4 XML text; returns null on miss / rate-limit / network error. */
export async function fetchForm4Xml(opts: {
  cik?: string | null;
  accessionNumber?: string | null;
  sourceUrl?: string | null;
}): Promise<{ xml: string; sourceUrl: string } | null> {
  const url = await resolveForm4XmlUrl(opts);
  if (!url) return null;
  const xml = await secGet(url);
  if (!xml || !/ownershipDocument|nonDerivativeTransaction/i.test(xml)) {
    return null;
  }
  return { xml, sourceUrl: url };
}
