/**
 * Local ingest worker — keeps feed fresh when not using Vercel cron.
 * Usage: node scripts/ingest-worker.mjs
 * Requires: dev server running OR DATABASE_URL for direct pipeline (via HTTP to cron).
 */
const BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const SECRET = process.env.CRON_SECRET || "";
const INTERVAL_MS = Number(process.env.INGEST_WORKER_MS || 30_000);

async function tick() {
  try {
    const res = await fetch(`${BASE}/api/cron/ingest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SECRET}`,
      },
    });
    const data = await res.json();
    console.log(new Date().toISOString(), res.status, JSON.stringify(data));
  } catch (err) {
    console.error(new Date().toISOString(), "ingest worker error:", err.message);
  }
}

console.log(`Ingest worker → ${BASE}/api/cron/ingest every ${INTERVAL_MS}ms`);
void tick();
setInterval(tick, INTERVAL_MS);
