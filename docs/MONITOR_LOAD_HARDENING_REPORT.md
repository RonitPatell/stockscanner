# TrustTicker Monitor — Market-Open Load Hardening Report

**Date:** 2026-08-01  
**Environment:** Local Node test runner (`tests/monitor-delivery-load.test.mts`) on developer workstation  
**Disclaimer:** These are **simulated local measurements**. They are **not** production or staging SLOs.  
**Do not publish performance targets as achieved from local tests.**

## Goals (configuration intent only — not claimed)

| Scenario | Intent |
|----------|--------|
| Concurrent Monitor sessions | 1,000 (lab); 5,000 if staging permits |
| Tracked symbols | Up to 10,000 in hub (clients get compact ladder ≤64) |
| Normalized event burst | 50,000 events/sec class stress (in-process) |
| Extremely active symbol | Hot symbol dominates attention ranking |
| Provider disconnect | Source circuit opens; no silent “live” lie |
| Redis / worker restart | Checkpoint restore |
| DB slowdown | Delivery hub path isolated from simulated DB delay |
| SSE reconnect storm | Last-Event-ID + sequence dedupe |
| Tab hidden ≥1 hour | Snapshot refresh; drop obsolete visuals |

## Architecture shipped

| Piece | Path |
|-------|------|
| Delivery hub (server-owned calc / fanout) | `src/domain/monitor/delivery/` |
| Redis/memory checkpoint | `src/lib/monitor/delivery/server-hub.ts` |
| Snapshot API | `GET /api/monitor/snapshot` (Pro + rate limit) |
| SSE stream + Last-Event-ID | `GET /api/monitor/stream` |
| Client ack | `POST /api/monitor/ack` |
| Worker tick | `POST /api/cron/monitor-delivery` (`authorizeCron`) |
| Admin metrics | `GET /api/admin/monitor-delivery` |
| Browser runtime (queue, frame budget, dedupe) | `src/lib/monitor/delivery/client-runtime.ts` |
| Live hook | `src/hooks/useMonitorDelivery.ts` (flag `MONITOR_LIVE_DELIVERY`) |

**Client contract:** browsers receive normalized snapshots/deltas only — not raw full-market ticks. Market math is not re-run independently per tab when live delivery is enabled.

## Sample sizes (local lab)

Exact numbers are printed as JSON lines (`loadScenario`) when the suite runs. Typical local samples:

| Scenario key | Sample size | Notes |
|--------------|-------------|-------|
| `track_10k_symbols_compact_ladder` | 12k events → ≤10k symbols; ladder ≤64 | Universe not shipped to clients |
| `burst_50k_normalized_events` | 50,000 events | Wall-clock logged; **not** an SLA |
| `sessions_1000_snapshot_apply` | 1,000 in-process runtimes | **Not** 1,000 real EventSource sockets |
| `sessions_5000_snapshot_apply` | 5,000 in-process runtimes | Override with `MONITOR_LOAD_SESSIONS_5K` |
| Resilience cases | Circuit / checkpoint / reconnect / hidden tab | Functional pass/fail |

## Achievement status

**Not achieved / not claimed** for any market-open production target. Staging must re-run with real Redis, real SSE fanout, provider feeds, and browser clients before any public performance statement.

## Reproducible commands

```bash
# Unit + load/resilience scenarios (local simulation)
npm run test:monitor-delivery

# Optional: shrink 5k session loop in constrained CI
set MONITOR_LOAD_SESSIONS_5K=1000
npm run test:monitor-delivery

# Worker tick (requires CRON_SECRET; staging)
curl -X POST "$APP_URL/api/cron/monitor-delivery" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"synthetic\":{\"symbolCount\":1000,\"events\":2000,\"hotSymbol\":\"HOT1\"}}"

# Admin metrics (admin session)
curl -H "Cookie: ..." "$APP_URL/api/admin/monitor-delivery"
```

Enable live UI path (staging):

```bash
MONITOR_LIVE_DELIVERY=1
NEXT_PUBLIC_MONITOR_LIVE_DELIVERY=1
```

## Staging checklist (before any claim)

1. Run 1k / 5k **real** authenticated EventSource connections against `/api/monitor/stream`.
2. Feed hub from quote worker (normalized events), not only synthetic cron bursts.
3. Kill Redis / restart worker; confirm checkpoint restore and `health` ≠ falsely `live` on stale data.
4. Throttle DB; confirm snapshot/delta publish continues.
5. Force provider disconnect; confirm degraded banner and circuit metrics.
6. Reconnect storm; confirm sequence dedupe and bounded queues.
7. Background a tab for ≥1 hour; confirm snapshot refresh on restore.

## Observability fields

From `hub.metrics()` / admin route:

- `lagMsAvg` / `lagMsMax`
- `eventsDroppedSource` / `eventsDroppedLag` / `eventsDroppedBackpressure` / `eventsDroppedObsoleteVisual`
- `inboundQueueDepth` / `outboundQueueDepth`
- `clientAcks`
- `circuitSource` / `circuitProcessing`
- `health` (`live` \| `degraded` \| `stale` \| `recovering` \| `disconnected`)
