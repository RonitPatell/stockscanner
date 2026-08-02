/**
 * Always-on desk workers (dedicated service — not Vercel serverless).
 *
 * Vercel cannot run persistent market-data sockets or session-long warmers.
 * This Railway (or Fly/VPS) supervisor owns:
 *   - priority news ingest
 *   - live quote / volume stream
 *   - Monitor market warm + snapshot ticks (lease-gated)
 *
 * Railway start command:
 *   node scripts/realtime-worker.mjs
 *
 * Required env:
 *   CRON_SECRET
 *   NEXT_PUBLIC_APP_URL   ← public Vercel URL, NOT localhost
 *   UPSTASH_REDIS_*       (recommended)
 *   FINNHUB_API_KEY       (recommended)
 *
 * Do not use browser traffic as a keepalive.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
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

function normalizeBaseUrl(raw) {
  let base = (raw || "").trim().replace(/\/+$/, "");
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

const onRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID
);

const BASE = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
const SECRET = (process.env.CRON_SECRET || "")
  .trim()
  .replace(/^['"]/, "")
  .replace(/['"]$/, "")
  .trim();

const problems = [];
if (!SECRET) problems.push("CRON_SECRET is missing");
if (!BASE) {
  problems.push("NEXT_PUBLIC_APP_URL is missing");
} else if (onRailway && /localhost|127\.0\.0\.1/i.test(BASE)) {
  problems.push(
    `NEXT_PUBLIC_APP_URL is "${BASE}" — on Railway it must be your public site URL (https://www.trustticker.com), not localhost`
  );
}
if (problems.length) {
  for (const p of problems) console.error(`[realtime] ${p}`);
  console.error(
    onRailway
      ? "[realtime] Set these in Railway → service → Variables, then redeploy."
      : "[realtime] Fix .env and retry."
  );
  process.exit(1);
}

if (!process.env.FINNHUB_API_KEY?.trim()) {
  console.warn(
    "[realtime] FINNHUB_API_KEY is not set — Finnhub market/company news skipped (PR wires + Yahoo + RSS still run)."
  );
}

/**
 * Railway (and many PaaS) expect something listening on $PORT.
 * Without this, the deploy looks "crashed" even if workers were fine.
 */
const PORT = Number(process.env.PORT || 8080);
const startedAt = Date.now();
const healthServer = createServer((req, res) => {
  if (req.url === "/health" || req.url === "/" || req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "trustticker-realtime-worker",
        appUrl: BASE,
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        children: children.map((c) => ({
          label: c.label,
          pid: c.proc.pid,
          restarts: c.restarts,
        })),
      })
    );
    return;
  }
  res.writeHead(404);
  res.end("not found");
});
healthServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[realtime] health server on :${PORT} (Railway keep-alive)`);
});

const children = [];
const MAX_RESTARTS = 20;

function start(script, label) {
  const entry = { label, proc: null, restarts: 0 };
  const launch = () => {
    const proc = spawn("node", [script], {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        NEXT_PUBLIC_APP_URL: BASE,
        CRON_SECRET: SECRET,
      },
    });
    entry.proc = proc;
    proc.on("exit", (code, signal) => {
      console.error(
        `[realtime] ${label} exited code=${code ?? "?"} signal=${signal ?? "-"}`
      );
      if (draining) return;
      entry.restarts += 1;
      if (entry.restarts > MAX_RESTARTS) {
        console.error(
          `[realtime] ${label} restarted too many times — shutting down`
        );
        shutdown("restart-limit");
        return;
      }
      const delay = Math.min(30_000, 1_000 * entry.restarts);
      console.error(`[realtime] restarting ${label} in ${delay}ms…`);
      setTimeout(launch, delay);
    });
  };
  children.push(entry);
  launch();
  return entry;
}

let draining = false;

function shutdown(reason) {
  if (draining) return;
  draining = true;
  console.log(`[realtime] shutting down (${reason})`);
  for (const c of children) {
    try {
      c.proc?.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  try {
    healthServer.close();
  } catch {
    /* ignore */
  }
  setTimeout(() => process.exit(reason === "restart-limit" ? 1 : 0), 2_500).unref();
}

async function beatSupervisor() {
  try {
    await fetch(`${BASE}/api/cron/worker-lease`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "heartbeat",
        heartbeat: {
          name: "realtime_supervisor",
          instanceId: `supervisor-${process.pid}`,
          meta: { providerConnected: true },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.warn(
      `[realtime] supervisor heartbeat failed: ${e?.message || e}`
    );
  }
}

console.log(
  `[realtime] starting desk workers → app ${BASE}${onRailway ? " (Railway)" : ""}`
);
start("scripts/priority-ingest-worker.mjs", "ingest:priority");
start("scripts/quote-stream.mjs", "quote:stream");
start("scripts/monitor-market-worker.mjs", "monitor:market");

void beatSupervisor();
setInterval(() => void beatSupervisor(), 30_000);

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
