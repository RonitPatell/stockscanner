/**
 * Fetch SEC companyfacts JSON (bounded, polite).
 * Parsing is fixture-driven; live fetch is optional for ingest hooks.
 */

import {
  SEC_USER_AGENT,
  waitForSecPermit,
} from "../ingest/sec-politeness.ts";
import type { SecCompanyfactsDocument } from "./types.ts";

function padCik(cik: string): string {
  return cik.replace(/\D/g, "").padStart(10, "0");
}

export function companyfactsUrlForCik(cik: string): string {
  return `https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`;
}

/**
 * Live fetch — returns null on permit failure, HTTP error, or invalid JSON.
 * Does not throw for empty/missing facts.
 */
export async function fetchCompanyfacts(
  cik: string
): Promise<SecCompanyfactsDocument | null> {
  const ok = await waitForSecPermit(2_500);
  if (!ok) return null;
  const url = companyfactsUrlForCik(cik);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": SEC_USER_AGENT,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as SecCompanyfactsDocument;
    if (!json || typeof json !== "object") return null;
    return json;
  } catch {
    return null;
  }
}
