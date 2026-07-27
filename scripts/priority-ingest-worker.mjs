/**
 * Priority ingest worker — separate adaptive schedules per tier.
 * Usage: npm run ingest:priority
 *
 * Does NOT claim a 2-second poll. Defaults follow market-phase intervals
 * configured in src/lib/ingest/sources.ts (tens of seconds during the session,
 * slower overnight). Override with INGEST_TIER_<N>_MS only when sustainable.
 *
 * Requires: Next app reachable; CRON_SECRET; same hosting notes as SETUP.md
 * (Railway/Fly/VPS → public Vercel URL).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function loadEnvFile() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;
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

loadEnvFile();

function normalizeBaseUrl(raw) {
  let base = (raw || "http://localhost:3000").trim().replace(/\/+$/, "");
  try {
    const u = new URL(base);
    if (u.hostname === "trustticker.com") {
      u.hostname = "www.trustticker.com";
      base = u.toString().replace(/\/+$/, "");
    }
  } catch {
    /* keep */
  }
  return base;
}

const BASE = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
const SECRET = (process.env.CRON_SECRET || "")
  .trim()
  .replace(/^['"]/, "")
  .replace(/['"]$/, "")
  .trim();
const onRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID
);

/**
 * Default tick cadence by tier (ms). These are worker wake-ups that hit
 * /api/cron/ingest-tier — source-level adaptive intervals still apply server-side.
 * Defaults are honest session-scale values, not a marketing "2s" claim.
 */
const DEFAULT_TIER_MS = {
  0: Number(process.env.INGEST_TIER_0_MS || 12_000),
  1: Number(process.env.INGEST_TIER_1_MS || 20_000),
  2: Number(process.env.INGEST_TIER_2_MS || 45_000),
  3: Number(process.env.INGEST_TIER_3_MS || 90_000),
};

if (!SECRET) {
  console.error("CRON_SECRET is missing.");
  process.exit(1);
}

if (onRailway && /localhost|127\.0\.0\.1/i.test(BASE)) {
  console.error(
    `NEXT_PUBLIC_APP_URL is "${BASE}" — set it to your public Vercel URL.`
  );
  process.exit(1);
}

let draining = false;
const inFlight = new Map();

async function postTier(tier) {
  const url = `${BASE}/api/cron/ingest-tier?tier=${tier}`;
  const res = await fetch(url, {
    method: "POST",
    redirect: "manual",
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "x-cron-secret": SECRET,
    },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  console.log(
    new Date().toISOString(),
    `tier${tier}`,
    res.status,
    JSON.stringify(data)
  );
}

function tick(tier) {
  if (draining) return;
  if (inFlight.get(tier)) return;
  inFlight.set(tier, true);
  void postTier(tier)
    .catch((err) => {
      console.error(new Date().toISOString(), `tier${tier} error:`, err.message);
    })
    .finally(() => {
      inFlight.set(tier, false);
    });
}

const timers = [];
for (const tier of [0, 1, 2, 3]) {
  const ms = DEFAULT_TIER_MS[tier];
  console.log(`Priority worker → tier ${tier} every ${ms}ms (${BASE})`);
  tick(tier);
  timers.push(setInterval(() => tick(tier), ms));
}

async function shutdown(signal) {
  if (draining) return;
  draining = true;
  console.log(new Date().toISOString(), `${signal}: draining…`);
  for (const t of timers) clearInterval(t);
  const deadline = Date.now() + 25_000;
  while ([...inFlight.values()].some(Boolean) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(new Date().toISOString(), "shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
