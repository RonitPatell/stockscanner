/**
 * Dedicated Monitor / market warm worker.
 *
 * Owns snapshot publication + premarket warm via cron-authenticated ticks.
 * Acquires a distributed lease so duplicate replicas stay idle.
 *
 * Started by realtime-worker.mjs (Railway) — not by browser traffic.
 *
 * Env: CRON_SECRET, NEXT_PUBLIC_APP_URL, UPSTASH_REDIS_* (on Vercel app)
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INSTANCE = randomBytes(4).toString("hex");

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

function normalizeBaseUrl(raw) {
  return (raw || "").trim().replace(/\/+$/, "");
}

const BASE = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
const SECRET = (process.env.CRON_SECRET || "")
  .trim()
  .replace(/^['"]/, "")
  .replace(/['"]$/, "")
  .trim();

if (!BASE || !SECRET) {
  console.error(
    "[monitor-market] NEXT_PUBLIC_APP_URL and CRON_SECRET are required"
  );
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${SECRET}`,
  "Content-Type": "application/json",
};

let leaseToken = null;
let draining = false;

async function lease(action, extra = {}) {
  const res = await fetch(`${BASE}/api/cron/worker-lease`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action,
      name: "monitor_market",
      token: leaseToken,
      ttlMs: 60_000,
      ...extra,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { ok: false };
  return res.json();
}

async function postCron(path) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(110_000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, json };
}

async function ensureLease() {
  if (leaseToken) {
    const renewed = await lease("renew");
    if (renewed.ok) return true;
    leaseToken = null;
  }
  const acquired = await lease("acquire");
  if (acquired.acquired && acquired.token) {
    leaseToken = acquired.token;
    console.log(`[monitor-market] lease acquired instance=${INSTANCE}`);
    return true;
  }
  console.log("[monitor-market] lease held by another worker — standby");
  return false;
}

function sessionPhase(now = new Date()) {
  // Approximate ET without tz db: UTC-4 (EDT) for warm windows; cron also self-resolves.
  const etHour = (now.getUTCHours() - 4 + 24) % 24;
  if (etHour >= 3 && etHour < 9) return "premarket";
  if (etHour >= 20 || etHour < 3) return "closed";
  return "open";
}

async function tick() {
  if (draining) return;
  const hasLease = await ensureLease();
  if (!hasLease) {
    await lease("heartbeat", {
      heartbeat: {
        name: "monitor_market",
        instanceId: `standby-${INSTANCE}`,
        meta: { session: sessionPhase() },
      },
    });
    return;
  }

  const phase = sessionPhase();
  const warm = await postCron(`/api/cron/market-warm?phase=${phase}`);
  const snap = await postCron("/api/cron/monitor-snapshot");
  const scanner = await postCron("/api/cron/scanner");

  console.log(
    `[monitor-market] phase=${phase} warm=${warm.status} snap=${snap.status} scanner=${scanner.status}`
  );
}

const TICK_MS = Number(process.env.MONITOR_MARKET_TICK_MS || 45_000);
console.log(
  `[monitor-market] starting → ${BASE} tick=${TICK_MS}ms instance=${INSTANCE}`
);

await tick();
const timer = setInterval(() => {
  void tick();
}, TICK_MS);

async function shutdown(signal) {
  if (draining) return;
  draining = true;
  clearInterval(timer);
  console.log(`[monitor-market] shutdown ${signal}`);
  if (leaseToken) {
    try {
      await lease("release");
    } catch {
      /* ignore */
    }
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
