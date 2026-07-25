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

function normalizeBaseUrl(raw) {
  let base = (raw || "http://localhost:3000").trim().replace(/\/+$/, "");
  // Apex → www: Node fetch drops Authorization on host redirects → false 401s
  try {
    const u = new URL(base);
    if (u.hostname === "trustticker.com") {
      u.hostname = "www.trustticker.com";
      base = u.toString().replace(/\/+$/, "");
    }
  } catch {
    /* keep as-is */
  }
  return base;
}

const BASE = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
const SECRET = (process.env.CRON_SECRET || "")
  .trim()
  .replace(/^['"]/, "")
  .replace(/['"]$/, "")
  .trim();
const WIRE_MS = Number(process.env.INGEST_WIRE_MS || 2_000);
const FULL_MS = Number(process.env.INGEST_FULL_MS || 90_000);
const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);

if (!SECRET) {
  console.error(
    "CRON_SECRET is missing. Set it in Railway Variables (same string as Vercel / local .env)."
  );
  process.exit(1);
}

console.log(
  `CRON_SECRET loaded (length=${SECRET.length}, startsWithQuote=${(process.env.CRON_SECRET || "").trim().startsWith('"')})`
);

if (onRailway && /localhost|127\.0\.0\.1/i.test(BASE)) {
  console.error(
    `NEXT_PUBLIC_APP_URL is "${BASE}" — Railway cannot reach your PC.\n` +
      `Set NEXT_PUBLIC_APP_URL to your live Vercel URL, e.g. https://your-app.vercel.app (no trailing slash).`
  );
  process.exit(1);
}

let wireInFlight = false;
let fullInFlight = false;

async function postCron(url) {
  return fetch(url, {
    method: "POST",
    redirect: "manual",
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "x-cron-secret": SECRET,
    },
  });
}

async function callCron(path, label) {
  let url = `${BASE}${path}`;
  try {
    let res = await postCron(url);

    // Follow one host redirect ourselves so Bearer is not stripped
    if ([301, 302, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (loc) {
        url = new URL(loc, url).toString();
        console.warn(
          new Date().toISOString(),
          `${label} following redirect → ${url} (set NEXT_PUBLIC_APP_URL to the final host to avoid this)`
        );
        res = await postCron(url);
      }
    }

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 200) };
    }
    console.log(new Date().toISOString(), label, res.status, JSON.stringify(data));
  } catch (err) {
    const cause = err?.cause?.message || err?.cause?.code || "";
    console.error(
      new Date().toISOString(),
      `${label} error:`,
      err.message,
      cause ? `(${cause})` : "",
      `→ ${url}`
    );
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
