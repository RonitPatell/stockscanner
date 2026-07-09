/**
 * Local ingest worker — keeps feed fresh when not using Vercel cron.
 * Usage: npm run ingest:worker
 * Requires: dev server running; CRON_SECRET in .env (same value Next.js uses).
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

const BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const SECRET = process.env.CRON_SECRET || "";
const WIRE_MS = Number(process.env.INGEST_WIRE_MS || 5_000);
const FULL_MS = Number(process.env.INGEST_FULL_MS || 90_000);

if (!SECRET) {
  console.error(
    "CRON_SECRET is missing. Add it to .env (same string Next.js uses), then re-run npm run ingest:worker"
  );
  process.exit(1);
}

let wireInFlight = false;
let fullInFlight = false;

async function callCron(path, label) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SECRET}`,
      },
    });
    const data = await res.json();
    console.log(new Date().toISOString(), label, res.status, JSON.stringify(data));
  } catch (err) {
    console.error(new Date().toISOString(), `${label} error:`, err.message);
  }
}

function wireTick() {
  if (wireInFlight) return;
  wireInFlight = true;
  void callCron("/api/cron/wire", "wire").finally(() => {
    wireInFlight = false;
  });
}

function fullTick() {
  if (fullInFlight) return;
  fullInFlight = true;
  void callCron("/api/cron/ingest", "full").finally(() => {
    fullInFlight = false;
  });
}

console.log(
  `Ingest worker → wire every ${WIRE_MS}ms, full every ${FULL_MS}ms (${BASE})`
);
wireTick();
fullTick();
setInterval(wireTick, WIRE_MS);
setInterval(fullTick, FULL_MS);
