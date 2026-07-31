/**
 * Local smoke test — free wire sources + cron tiers + health. No secrets printed.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  }
}

const BASE = "http://localhost:3000";
const SECRET = (process.env.CRON_SECRET || "").trim();
const FH = (process.env.FINNHUB_API_KEY || "").trim();
const results = [];

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}
function info(name, detail) {
  console.log(`INFO  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function probeRss(name, url) {
  try {
    const r = await fetch(url, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, */*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await r.text();
    const items = (text.match(/<item[\s>]/gi) || []).length;
    if (!r.ok) fail(name, `HTTP ${r.status}`);
    else if (items === 0) fail(name, "200 but no <item> entries");
    else pass(name, `${items} RSS items`);
  } catch (e) {
    fail(name, e.message);
  }
}

async function main() {
  try {
    const r = await fetch(`${BASE}/api/health`);
    const j = await r.json();
    if (r.ok) pass("health", `status=${j.status} feedItems=${j.feedItemCount ?? "?"}`);
    else fail("health", `HTTP ${r.status}`);
  } catch (e) {
    fail("health", e.message);
  }

  await probeRss(
    "rss_marketwatch",
    "https://feeds.marketwatch.com/marketwatch/marketpulse/"
  );
  await probeRss(
    "rss_cnbc",
    "https://www.cnbc.com/id/15839135/device/rss/rss.html"
  );
  await probeRss(
    "rss_yahoo_sample",
    "https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL,MSFT,NVDA&region=US&lang=en-US"
  );

  if (!FH) {
    info("finnhub_key", "FINNHUB_API_KEY missing — company/market API wire skipped");
  } else {
    pass("finnhub_key", `present (len=${FH.length})`);
  }

  if (!SECRET) {
    fail("tier0_ingest", "CRON_SECRET missing");
  } else {
    for (const tier of [0, 1]) {
      const label = `tier${tier}_ingest`;
      try {
        const r = await fetch(`${BASE}/api/cron/ingest-tier?tier=${tier}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SECRET}`,
            "x-cron-secret": SECRET,
          },
          signal: AbortSignal.timeout(60_000),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok) {
          pass(
            label,
            `sources ${j.sourcesSucceeded}/${j.sourcesAttempted} ok, fail=${j.sourcesFailed}, fetched=${j.articlesFetched}, ingested=${j.articlesIngested}`
          );
          if (j.sourcesFailed > 0) {
            info(label + "_note", "a source failed — check Next.js terminal");
          }
        } else {
          fail(label, `HTTP ${r.status} ${JSON.stringify(j).slice(0, 220)}`);
        }
      } catch (e) {
        fail(label, e.message);
      }
    }

    try {
      const r = await fetch(`${BASE}/api/cron/wire`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SECRET}`,
          "x-cron-secret": SECRET,
        },
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) pass("wire_cron", JSON.stringify(j).slice(0, 160));
      else fail("wire_cron", `HTTP ${r.status}`);
    } catch (e) {
      fail("wire_cron", e.message);
    }
  }

  try {
    const r = await fetch(`${BASE}/api/health`);
    const j = await r.json();
    if (r.ok) {
      pass(
        "pipeline",
        `health=${j.status} feedAgeSec=${j.feedAgeSec ?? "?"} feedItems=${j.feedItemCount ?? "?"}`
      );
    } else fail("pipeline", `HTTP ${r.status}`);
  } catch (e) {
    fail("pipeline", e.message);
  }

  try {
    const r = await fetch("http://127.0.0.1:8080/health");
    const j = await r.json();
    if (r.ok && j.ok) {
      pass(
        "realtime_worker",
        `uptime=${j.uptimeSec}s children=${(j.children || []).join(",")}`
      );
    } else fail("realtime_worker", `HTTP ${r.status}`);
  } catch {
    info(
      "realtime_worker",
      "not listening on :8080 — run npm run realtime:worker for always-on ingest"
    );
  }

  const failed = results.filter((x) => !x.ok);
  console.log("");
  if (failed.length === 0) console.log("ALL CHECKS PASSED");
  else {
    console.log(`${failed.length} CHECK(S) FAILED`);
    process.exitCode = 1;
  }
}

main();
