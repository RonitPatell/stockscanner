/**
 * Fetch Schedule 13D/13G primary document via polite SEC access.
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
        Accept: "application/json, text/html, application/xhtml+xml, */*",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

type IndexDoc = { name?: string; type?: string };

export async function resolveOwnershipDocUrl(opts: {
  cik?: string | null;
  accessionNumber?: string | null;
  sourceUrl?: string | null;
}): Promise<string | null> {
  const accession =
    opts.accessionNumber || parseAccessionFromUrl(opts.sourceUrl) || null;
  if (!accession) {
    if (opts.sourceUrl && /\.(htm|html|txt)($|\?)/i.test(opts.sourceUrl)) {
      return opts.sourceUrl;
    }
    return null;
  }

  const cik = cikFromOpts(opts.cik, opts.sourceUrl, accession);
  if (!cik) {
    if (opts.sourceUrl && /\.(htm|html|txt)($|\?)/i.test(opts.sourceUrl)) {
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
      const preferred =
        list.find(
          (d) =>
            typeof d.name === "string" &&
            /\.(htm|html)$/i.test(d.name) &&
            /sc13|schedule|13d|13g/i.test(d.name)
        ) ||
        list.find(
          (d) =>
            typeof d.name === "string" &&
            /\.(htm|html)$/i.test(d.name) &&
            !/ex-|\.xsd|xml/i.test(d.name)
        ) ||
        list.find((d) => typeof d.name === "string" && /\.txt$/i.test(d.name));
      if (preferred?.name) {
        return `https://www.sec.gov/Archives/edgar/data/${cik}/${nodash}/${preferred.name}`;
      }
    } catch {
      /* fall through */
    }
  }

  if (opts.sourceUrl && /\.(htm|html|txt)($|\?)/i.test(opts.sourceUrl)) {
    return opts.sourceUrl;
  }
  return null;
}

export async function fetchOwnershipDocument(opts: {
  cik?: string | null;
  accessionNumber?: string | null;
  sourceUrl?: string | null;
}): Promise<{ body: string; sourceUrl: string } | null> {
  const url = await resolveOwnershipDocUrl(opts);
  if (!url) return null;
  const body = await secGet(url);
  if (!body || body.length < 80) return null;
  return { body, sourceUrl: url };
}
