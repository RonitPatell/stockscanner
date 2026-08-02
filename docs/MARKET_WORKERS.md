# Market workers (no user-traffic warming)

## Why a dedicated service

**Vercel serverless cannot run persistent market workers.** Functions are request-scoped, have short max durations, and cannot hold Finnhub WebSockets or session-long quote pollers reliably.

TrustTicker therefore splits:

| Layer | Platform | Role |
|-------|----------|------|
| App / APIs / SSE | **Vercel** | Serve users; read Redis/Postgres; never open market providers |
| Persistent workers | **Railway** (or Fly/VPS) | Quote stream, news ingest, Monitor warm + snapshot |

Browser traffic is **never** a keepalive or warm path.

## Start command

Railway service (separate from any web app):

```bash
node scripts/realtime-worker.mjs
```

(`railway.toml` already sets this.) Healthcheck: `GET /health` on `$PORT`.

Children spawned by the supervisor:

1. `scripts/priority-ingest-worker.mjs` — news tiers  
2. `scripts/quote-stream.mjs` — Yahoo (+ optional Finnhub WS) → Redis `quotes:v2`  
3. `scripts/monitor-market-worker.mjs` — lease-gated market warm + Monitor snapshot + scanner

## Required env (worker service)

| Variable | Required |
|----------|----------|
| `CRON_SECRET` | yes (same as Vercel) |
| `NEXT_PUBLIC_APP_URL` | yes (public HTTPS app, not localhost) |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | strongly recommended |
| `FINNHUB_API_KEY` | recommended |
| `MONITOR_MARKET_TICK_MS` | optional (default 45000) |

## Ownership / leases

Workers call `POST /api/cron/worker-lease` (cron auth, fail-closed) to:

- acquire / renew / release named leases (`quote_stream`, `monitor_market`, …)
- write heartbeats (`quote_stream`, `monitor_market`, `realtime_supervisor`, …)

Duplicate Railway replicas: non-leaders standby.

## Premarket / open / closed

| Phase | When (UTC cron safety net) | What |
|-------|----------------------------|------|
| Premarket warm | `30 7 * * 1-5` → `/api/cron/market-warm?phase=premarket` | Symbol master, float/profiles, quote baselines, scanner, Monitor snapshot |
| Open snapshot | `25 13 * * 1-5` → `phase=open` | Valid opening snapshot before US regular session traffic |
| Closed overnight | `15 1 * * *` + minute `monitor-snapshot` | CLOSED session label on snapshot |
| Scanner | `*/3 * * * 1-5` | Worker-owned scanner Redis cache |

Railway `monitor-market-worker` also ticks these every ~45s during its lease.

## User routes (hardened)

These **must not** connect providers, rebuild universes, or publish the first Monitor snapshot:

- `GET /api/scanner` — cache read only  
- `GET /api/quotes` — cache / live-stream timestamp only  
- `GET /api/market-state` — cache only  
- `GET /api/monitor/snapshot` — Redis/PG read only (unchanged)

## Restart recovery

`tickMonitorSnapshotService`:

1. Restores delivery checkpoint from Redis  
2. If no active public snapshot → republish latest durable Postgres snapshot (`recovery: true`)  
3. CLOSED sessions force `marketSession: "closed"`  
4. Missing worker heartbeats during open sessions → snapshot `dataQuality: "degraded"`

## Public readiness

`GET /api/health` includes a sanitized `market` object:

```json
{
  "ready": true,
  "status": "ready",
  "session": "regular",
  "checks": {
    "providerConnected": "ok",
    "symbolUniverseLoaded": "ok",
    "previousSessionBaselinesLoaded": "ok",
    "activeSnapshotPublished": "ok",
    "redisReachable": "ok",
    "databaseReachable": "ok",
    "eventStreamWritable": "ok",
    "workerHeartbeat": "ok"
  }
}
```

No snapshot ids, ages, provider keys, or internal errors.

## Cron auth

All `/api/cron/*` routes use `authorizeCron` — **fail-closed** without `CRON_SECRET` outside local `next dev`.
