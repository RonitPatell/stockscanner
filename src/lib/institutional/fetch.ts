/**
 * Fetch 13F-HR primary docs (cover + information table) via polite SEC access.
 */

import { SEC_USER_AGENT, waitForSecPermit } from "../ingest/sec-politeness.ts";
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
  const ok = await waitForSecPermit(2_500);
  if (!ok) return null;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": SEC_USER_AGENT,
        Accept: "application/json, application/xml, text/xml, text/html, */*",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

type IndexDoc = { name?: string; type?: string };

export async function fetch13fDocuments(opts: {
  cik?: string | null;
  accessionNumber?: string | null;
  sourceUrl?: string | null;
}): Promise<{
  coverXml: string | null;
  infoTableXml: string | null;
  sourceUrl: string | null;
} | null> {
  const accession =
    opts.accessionNumber || parseAccessionFromUrl(opts.sourceUrl) || null;
  if (!accession) return null;
  const cik = cikFromOpts(opts.cik, opts.sourceUrl, accession);
  if (!cik) return null;

  const nodash = accessionNoDashes(accession);
  const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${nodash}`;
  const indexRaw = await secGet(`${base}/index.json`);
  let coverXml: string | null = null;
  let infoTableXml: string | null = null;
  let sourceUrl: string | null = opts.sourceUrl ?? null;

  if (indexRaw) {
    try {
      const json = JSON.parse(indexRaw) as {
        directory?: { item?: IndexDoc[] | IndexDoc };
      };
      const items = json.directory?.item;
      const list = Array.isArray(items) ? items : items ? [items] : [];
      const infoDoc =
        list.find(
          (d) =>
            typeof d.name === "string" &&
            /information.?table|infotable/i.test(d.name) &&
            /\.xml$/i.test(d.name)
        ) ||
        list.find(
          (d) =>
            typeof d.name === "string" &&
            /form13f|primary_doc/i.test(d.name) === false &&
            /\.xml$/i.test(d.name) &&
            /13f|info/i.test(d.name)
        );
      const coverDoc =
        list.find(
          (d) =>
            typeof d.name === "string" &&
            /primary_doc\.xml/i.test(d.name)
        ) ||
        list.find(
          (d) =>
            typeof d.name === "string" &&
            /form13f/i.test(d.name) &&
            /\.xml$/i.test(d.name)
        );

      if (infoDoc?.name) {
        infoTableXml = await secGet(`${base}/${infoDoc.name}`);
        sourceUrl = `${base}/${infoDoc.name}`;
      }
      if (coverDoc?.name) {
        coverXml = await secGet(`${base}/${coverDoc.name}`);
        if (!sourceUrl) sourceUrl = `${base}/${coverDoc.name}`;
      }
    } catch {
      /* fall through */
    }
  }

  // Common fallbacks
  if (!infoTableXml) {
    for (const name of [
      "infotable.xml",
      "informationtable.xml",
      "form13fInfoTable.xml",
    ]) {
      const body = await secGet(`${base}/${name}`);
      if (body && /infoTable/i.test(body)) {
        infoTableXml = body;
        sourceUrl = `${base}/${name}`;
        break;
      }
    }
  }
  if (!coverXml) {
    const body = await secGet(`${base}/primary_doc.xml`);
    if (body) coverXml = body;
  }

  if (!infoTableXml && !coverXml) return null;
  return { coverXml, infoTableXml, sourceUrl };
}
