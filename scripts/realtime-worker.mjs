/**
 * Always-on desk workers: priority news ingest + live quote/volume stream.
 *
 * Stock Titan does not sell their feed. With BENZINGA_API_KEY set, Tier-0
 * Benzinga News + Press Releases is the licensed realtime wire. Quotes/volume
 * come from Yahoo batch (+ optional Finnhub WS).
 *
 * Deploy on Railway / Fly / VPS (not inside Cursor):
 *   npm run realtime:worker
 *
 * Required env:
 *   CRON_SECRET
 *   NEXT_PUBLIC_APP_URL          (production Vercel URL)
 *   BENZINGA_API_KEY             (paid — realtime news)
 *   UPSTASH_REDIS_REST_URL/TOKEN (strongly recommended)
 *   FINNHUB_API_KEY              (optional — tick stream)
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile() {
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

const children = [];

function start(script, label) {
  const child = spawn("node", [script], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    console.error(
      `${label} exited code=${code ?? "?"} signal=${signal ?? "-"} — shutting down desk workers`
    );
    for (const c of children) {
      try {
        c.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    process.exit(code ?? 1);
  });
  return child;
}

if (!process.env.BENZINGA_API_KEY?.trim()) {
  console.warn(
    "[realtime] BENZINGA_API_KEY is not set — news will be free RSS/SEC only (not Stock-Titan-class speed)."
  );
}
if (!process.env.CRON_SECRET?.trim()) {
  console.error("[realtime] CRON_SECRET is required.");
  process.exit(1);
}
if (!process.env.NEXT_PUBLIC_APP_URL?.trim()) {
  console.error("[realtime] NEXT_PUBLIC_APP_URL is required (your Vercel URL).");
  process.exit(1);
}

console.log(
  "Starting realtime desk workers (priority ingest + quote/volume stream)…"
);
start("scripts/priority-ingest-worker.mjs", "ingest:priority");
start("scripts/quote-stream.mjs", "quote:stream");

function shutdown(sig) {
  console.log(`Received ${sig} — stopping workers`);
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(0), 3_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
