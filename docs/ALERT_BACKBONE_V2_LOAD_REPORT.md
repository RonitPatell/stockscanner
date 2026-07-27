# Alert Backbone V2 — Local / Staging Load Report

**Date:** 2026-07-27  
**Environment:** Local Node test runner (`tests/alert-backbone-load.test.mts`)  
**Disclaimer:** These are **simulated local measurements**. They are **not** production SLOs. Do **not** advertise any configured target as achieved based on this report.

## Configured targets (goals only)

From `src/lib/alert-backbone/targets.ts` / `ALERT_SLO_*` env:

| Metric | Configured target |
|--------|-------------------|
| Provider→ingestion p50 / p90 | 15s / 60s |
| Ingestion→classification p50 / p90 | 250ms / 2s |
| Classification→in-app p50 / p90 | 3s / 10s |
| Channel success rate | ≥ 95% |
| Duplicate rate | ≤ 2% |
| Data gaps / hour | ≤ 5 |

**Achievement status:** **Not achieved / not claimed** — production sample size and measurements required (`compareTarget` requires n≥100).

## Measured local scenarios

| Scenario | Result | Key numbers | Assumptions |
|----------|--------|-------------|-------------|
| Burst 5,000 events | PASS | enqueue ~40–59ms; sample drain 500 in ~4–7ms; queues split licensed/editorial | In-memory queues (Redis unset or unused for this path). Upstash REST would be slower. Full 5k drain not required. |
| 1,000 browser connection claims | PASS | 1000 unique claims in ~1–2ms | Idempotency claims only — **not** 1000 real EventSource sockets. Next.js runtime limits real SSE fan-out. |
| Provider disconnect recovery | PASS | 20 in-flight jobs reclaimed | Processing list = durable in-flight set after crash. |
| Redis restart simulation | PASS | Lock reacquired after memory clear | Process-local locks when Redis absent; live Upstash restart clears NX keys similarly. No live Redis wipe in CI. |
| DB slowdown isolation | PASS | Discord delivered while email delayed; wall ~125ms | Simulated 120ms delay, not real Postgres stall. |
| Duplicate provider delivery | PASS | Same event version; second SMS claim denied | Idempotency key + omitVersion channel claim. |
| Slow SMS + email vendors | PASS | Wall ~104–114ms for two 100ms sends | Parallel `Promise.allSettled`; sequential would be ≥200ms. |

## Unit coverage (also local)

- Event versions (preliminary → enrich without duplicate channel alerts)
- Separate queues + retry / DLQ / recover-after-restart
- Stale category suppression
- Unreliable provider timestamp detection
- Distributed locks
- Source heartbeat gap detection
- Delivery lifecycle timestamps (accepted → queued → delivered)

## Architecture notes vs latency map

See `docs/ALERT_BACKBONE_V2_LATENCY_MAP.md` (written **before** code).

Implemented:

- Separate Redis/memory queues: primary_filings, licensed_news, editorial_news, market_events, enrichment
- Preliminary event registration + enrichment enqueue (historical skipped on wire critical path when flag on)
- Event versions + channel idempotency (updates do not re-alert)
- Redis distributed locks, heartbeats, gap→recovery_poll, retries/backoff/DLQ
- Channel isolation: in-app first, Discord/SMS/email/push independent
- SSE heartbeats + Last-Event-ID reconnect; REST poll remains recovery
- Admin health dashboard `/admin/alert-backbone`
- Cron `/api/cron/alert-backbone?probe=1` (weekdays every 2m) for queue drain + synthetic probe

**Not claimed:** Licensed Finnhub/Benzinga native WebSocket news streams unless contractually wired — workers use persistent poll + gap backfill as the streaming substitute.

## How to re-run

```bash
node --env-file=.env --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --experimental-strip-types tests/alert-backbone.test.mts tests/alert-backbone-load.test.mts
```
