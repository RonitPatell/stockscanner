# Priority ingest — deployment notes (existing hosting)

This project already deploys on **Vercel** (Next.js app + cron) with an optional
always-on worker on **Railway / Fly / VPS**. The priority ingest system fits that
setup — it does **not** require a new cloud provider.

## What changed

- `/api/cron/wire` and `/api/cron/ingest` still work (same auth, same result shape).
  Internally they now run **Tier 0+1** and **Tier 2+3** when `PRIORITY_INGEST_ENABLED`
  is on (default).
- New tick route: `POST /api/cron/ingest-tier?tier=0|1|2|3` (cron secret).
- Recommended worker: `npm run ingest:priority` (adaptive per-tier wake-ups).
- Legacy blended worker: `npm run ingest:worker` (defaults to **15s** wire / **90s** full —
  not 2s). Set `INGEST_WIRE_MS` explicitly only if you have measured it is sustainable.

## Do not claim “2 second” polls

A 2s interval is **not** the default. Only advertise sub‑10s polling if:

1. `INGEST_TIER_*_MS` / source intervals are explicitly configured that low,
2. the source is licensed / ToS‑safe at that rate,
3. Redis locking + rate limits keep multi-instance safe,
4. Trust Status / latency traces **measure** the real cycle.

## Vercel (unchanged crons)

Keep existing `vercel.json` crons for wire (1/min) and ingest (*/2). They remain
a safety net when the worker is down. They will not achieve sub‑minute cadence alone.

Optional: you can leave crons as-is; the worker owns finer schedules.

## Railway / Fly / VPS worker

1. Deploy the **same** Next app on Vercel.
2. Run a second service with start command:

```bash
npm run ingest:priority
```

3. Env vars (same as today — no new vendor):

| Variable | Required | Notes |
|----------|----------|-------|
| `CRON_SECRET` | yes | Same as Vercel |
| `NEXT_PUBLIC_APP_URL` | yes | Public Vercel URL (`https://www.trustticker.com`), not localhost |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | strongly recommended | Distributed locks, idempotency, DLQ, alert claims |
| `DATABASE_URL` | on Vercel | Worker only HTTP‑calls the app |
| `ADMIN_EMAILS` | for admin UI | `/admin/ingest`, `/admin/latency` |
| `SEC_USER_AGENT` | optional | Defaults to TrustTicker + contact email |
| `SEC_MAX_RPS` | optional | Default 8 (below 10/s) |
| `PRIORITY_INGEST_ENABLED` | optional | Default on; `false` = legacy blended path |
| `INGEST_SOURCE_<ID>_ENABLED` | optional | Per-source kill switch (`false` / `off`) |
| `INGEST_TIER_<N>_ENABLED` | optional | Disable an entire tier |
| `INGEST_TIER_<N>_MS` | optional | Worker wake interval override |

4. Graceful shutdown: the priority worker handles `SIGTERM`/`SIGINT`, stops scheduling,
   and waits briefly for in-flight tier ticks (avoids orphaned work). Redis locks expire
   via TTL if a process dies hard.

## Redis locking

When Upstash is configured, only one worker processes a given **source partition**.
Without Redis, locks are process-local (fine for a single worker; unsafe for many).

## SEC compliance

- Aggregate SEC requests capped under **10/s** (default **8/s**).
- Declared User-Agent: company name + contact (`SEC_USER_AGENT`).
- Atom fetches wait for a permit before calling EDGAR.

## Admin

- Health + DLQ: `/admin/ingest` (session email in `ADMIN_EMAILS`)
- Retry API: `POST /api/admin/ingest` with
  `{ "action": "retry_dlq", "id": "…" }` or
  `{ "action": "retry_source", "sourceId": "sec_edgar" }`

## Alerts after restart

Alert sends claim a Redis key `alert:claim:{userId}:{catalystId}:{channel}` so
duplicate workers / restarts do not double-fire within the cooldown window
(still backed by `AlertLog` DB cooldown).

## Rollback

Set `PRIORITY_INGEST_ENABLED=false` to restore the previous blended
`ingestWireBurst` / `fetchMarketNews` path inside the same cron routes.
