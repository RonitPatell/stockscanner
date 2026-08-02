# Realtime desk setup (news + volume)

## Honest scope

- **Stock Titan does not sell their feed.** There is no licensed “Stock Titan API.”
- TrustTicker’s default path is **free issuer wires + SEC + Finnhub + Yahoo ticker RSS + editorial RSS**, with **always-on workers** for poll cadence and Yahoo volume.
- Closing Cursor stops local processes. Production must run on **Vercel (app) + Railway/Fly/VPS (workers)**.

## Paid news options (if you want faster than free RSS)

| Vendor | Env | Honest cadence | Notes |
|--------|-----|----------------|-------|
| **Polygon / Massive News** | `POLYGON_API_KEY` | ~hourly on Stocks plans | Wired as Tier-1 `polygon_news` when keyed |
| **Finnhub** (you likely have) | `FINNHUB_API_KEY` | seconds–minutes | Market + company news on wire tier |
| **Benzinga Cloud** | — | ~seconds | Not used by TrustTicker (by product choice) |
| **Finlight / Marketaux / Alpha Vantage News** | — | REST poll | Not wired yet; evaluate if Polygon isn’t enough |

**5-second publish→desk is only honest with a licensed low-latency wire + always-on worker.** Free PR RSS is usually tens of seconds. Public “Desk speed” metrics measure TrustTicker processing / wire catch — **not** hour-old editorial RSS age.

## Configure

Set on **Vercel** and the **worker** service:

| Variable | Required |
|----------|----------|
| `CRON_SECRET` | yes |
| `NEXT_PUBLIC_APP_URL` | yes (public HTTPS app URL) |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | strongly recommended |
| `FINNHUB_API_KEY` | recommended (market + company news) |

Worker start command (Railway → **Settings → Deploy → Custom Start Command**):

```bash
node scripts/realtime-worker.mjs
```

Also set **Variables** on that Railway service (not only Vercel):

| Variable | Value |
|----------|--------|
| `CRON_SECRET` | same as Vercel |
| `NEXT_PUBLIC_APP_URL` | `https://www.trustticker.com` (**not** `http://localhost:3000`) |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | recommended |
| `FINNHUB_API_KEY` | recommended |

If logs show `npm error command sh -c node scripts/realtime-worker.mjs`, scroll **above** that line — the real reason is usually missing env or `NEXT_PUBLIC_APP_URL=localhost`. The worker listens on `$PORT/health` so Railway healthchecks do not kill it.

## What runs

| Process | Script | Cadence |
|---------|--------|---------|
| Priority ingest | `scripts/priority-ingest-worker.mjs` | Tier 0 PR/SEC ~8s; Tier 1 Finnhub/Yahoo/editorial ~10s |
| Quote / volume | `scripts/quote-stream.mjs` | Yahoo ~1.2s batches; heavy RVol/% names every cycle (lease-gated) |
| Monitor market | `scripts/monitor-market-worker.mjs` | ~45s warm + snapshot + scanner (lease-gated) |

Vercel crons (`/api/cron/wire`, `/api/cron/ingest`, `/api/cron/monitor-snapshot`, `/api/cron/market-warm`) remain a **safety net** only. They are not the realtime path and must not rely on browser traffic.

See **[MARKET_WORKERS.md](./MARKET_WORKERS.md)** for leases, CLOSED snapshots, readiness, and the “no user-route warming” rules.

## Feed rules

- Stock-related headlines only (ticker resolved + about that symbol).
- Duplicate stories collapse to one row (`story-cluster`).
- Feed window is **~8 hours** (session news), not a day-old archive.

## Verify

1. Worker logs show tier 0/1 ticks with `sourcesSucceeded` > 0.
2. `/admin/ingest` (if admin) shows PR wires, Finnhub, Yahoo, RSS healthy.
3. Dashboard feed: new ticker headlines appear as publishers update (usually tens of seconds on free RSS).
4. Hot names show updating **volume / RVol** (Yahoo batch), not stuck estimates.

## If news is slow or empty

- Worker not running → Vercel cron only (~60s).
- Missing `FINNHUB_API_KEY` → Finnhub skipped; PR/SEC/Yahoo/RSS still run.
- Redis free-tier capped → quotes may pause; upgrade Upstash or rely on HTTP ingest mode.
- Publishers lag → free RSS is not a sub-second licensed wire; expect seconds-to-tens-of-seconds.
