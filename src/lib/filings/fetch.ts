/**
 * Fetch 10-Q / 10-K primary HTML via polite SEC access.
 */

import { SEC_USER_AGENT, waitForSecPermit } from "../ingest/sec-politeness.ts";
import { isAllowedSecDocumentUrl } from "../ingest/sec-url.ts";
import { parseAccessionFromUrl } from "../dilution/extract.ts";

function accessionNoDashes(accession: string): string {
  return accession.replace(/-/g, "");
}

function cikFromOpts(
  cik: string | null | undefined,
  sourceUrl: string | null | undefined,
  accession: string
): string | null {
  if (cik && /^\d+$/.test(String(cik).replace(/^0+/, "") || "0")) {
    return String(parseInt(String(cik), 10));
  }
  if (sourceUrl) {
    const m = sourceUrl.match(/\/data\/(\d+)\//i);
    if (m) return m[1]!;
  }
  const prefix = accession.split("-")[0];
  if (prefix && /^\d+$/.test(prefix)) return String(parseInt(prefix, 10));
  return null;
}

async function secGet(url: string): Promise<string | null> {
  if (!isAllowedSecDocumentUrl(url)) return null;
  const ok = await waitForSecPermit(2_500);
  if (!ok) return null;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": SEC_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

type IndexDoc = { name?: string; type?: string };

export async function fetchPeriodicFilingHtml(opts: {
  cik?: string | null;
  accessionNumber?: string | null;
  sourceUrl?: string | null;
}): Promise<{ html: string; sourceUrl: string } | null> {
  const accession =
    opts.accessionNumber || parseAccessionFromUrl(opts.sourceUrl) || null;
  if (!accession) {
    if (opts.sourceUrl && /\.(htm|html)($|\?)/i.test(opts.sourceUrl)) {
      const html = await secGet(opts.sourceUrl);
      if (html && html.length > 500) return { html, sourceUrl: opts.sourceUrl };
    }
    return null;
  }

  const cik = cikFromOpts(opts.cik, opts.sourceUrl, accession);
  if (!cik) return null;

  const nodash = accessionNoDashes(accession);
  const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${nodash}`;
  const indexRaw = await secGet(`${base}/index.json`);

  if (indexRaw) {
    try {
      const json = JSON.parse(indexRaw) as {
        directory?: { item?: IndexDoc[] | IndexDoc };
      };
      const items = json.directory?.item;
      const list = Array.isArray(items) ? items : items ? [items] : [];
      const preferred =
        list.find(
          (d) =>
            typeof d.name === "string" &&
            /\.(htm|html)$/i.test(d.name) &&
            /10-?[qk]/i.test(d.name) &&
            !/ex[-_]/i.test(d.name)
        ) ||
        list.find(
          (d) =>
            typeof d.name === "string" &&
            /\.(htm|html)$/i.test(d.name) &&
            !/ex[-_]|graphic|xsl/i.test(d.name)
        );
      if (preferred?.name) {
        const url = `${base}/${preferred.name}`;
        const html = await secGet(url);
        if (html && html.length > 500) return { html, sourceUrl: url };
      }
    } catch {
      /* fall through */
    }
  }

  if (opts.sourceUrl && /\.(htm|html)($|\?)/i.test(opts.sourceUrl)) {
    const html = await secGet(opts.sourceUrl);
    if (html && html.length > 500) {
      return { html, sourceUrl: opts.sourceUrl };
    }
  }
  return null;
}
