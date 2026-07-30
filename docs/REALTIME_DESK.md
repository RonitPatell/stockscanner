# Realtime desk setup (news + volume)

## Honest scope

- **Stock Titan does not sell their feed.** You cannot plug “Stock Titan’s method” in via an API key.
- TrustTicker’s paid path is **Benzinga News + Press Releases** (same class of licensed wire other retail platforms use) plus **always-on workers** for poll cadence and Yahoo volume.
- Closing Cursor stops local processes. Production must run on **Vercel (app) + Railway/Fly/VPS (workers)**.

## Buy / configure

1. Get a Benzinga Cloud key with **Newsfeed** and **Press Releases** entitlements:  
   https://www.benzinga.com/apis/
2. Set on **Vercel** and the **worker** service:

| Variable | Required |
|----------|----------|
| `BENZINGA_API_KEY` | yes (for Titan-class news) |
| `CRON_SECRET` | yes |
| `NEXT_PUBLIC_APP_URL` | yes (public HTTPS app URL) |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | strongly recommended |
| `FINNHUB_API_KEY` | optional (tick stream) |
| `BENZINGA_CHANNELS` | optional extra channels |
| `BENZINGA_INCLUDE_PRS` | default on; set `0` to disable PR pass |

3. Worker start command:

```bash
npm run realtime:worker
```

## What runs

| Process | Script | Cadence |
|---------|--------|---------|
| Priority ingest | `scripts/priority-ingest-worker.mjs` | Benzinga Tier 0 ~5s RTH; SEC/PR wires; slower RSS tiers |
| Quote / volume | `scripts/quote-stream.mjs` | Yahoo ~1.2s batches; heavy RVol/% names every cycle |

Vercel crons (`/api/cron/wire`, `/api/cron/ingest`) remain a **safety net** only (~1–2 min). They are not the realtime path.

## Verify

1. Worker logs show Benzinga ticks without `401` / `403`.
2. `/admin/ingest` (if admin) shows `benzinga_api` healthy.
3. Dashboard feed: new headlines appear within seconds of Benzinga publish.
4. Hot names show updating **volume / RVol** (Yahoo batch), not stuck estimates.

## If news is slow or empty

- Missing `BENZINGA_API_KEY` → free RSS only.
- Worker not running → Vercel cron only (~60s).
- Auth errors → wrong key or plan without News/PR entitlement.
- Redis free-tier capped → quotes may pause; upgrade Upstash or rely on HTTP ingest mode.
