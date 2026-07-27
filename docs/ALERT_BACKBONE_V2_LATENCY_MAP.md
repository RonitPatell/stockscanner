# Alert Backbone V2 — Latency Map

> Written **before** Alert Backbone V2 code changes.  
> Purpose: document the production path from provider event → user-visible alert, and the gaps V2 closes.  
> **Do not treat any SLO number in this document as achieved** until production measurements satisfy configured targets.

## End-to-end path (as of audit)

```
Provider HTTP/Atom/RSS/API
  → Worker/cron tick (priority-ingest-worker | ingest-worker | Vercel cron)
  → Tiered fetch (SEC / issuer wires / licensed / editorial / slow)
  → Annotate timestamps + quality
  → Idempotency claim (Redis NX)
  → Verify + ticker resolve + quarantine
  → Heuristic classify (blocking) + Prisma Catalyst upsert
  → Feed cache prepend/rebuild (Redis)
  → Browser SSE (2s poll of cache) + 12s REST poll fallback
  → [async] Quote enrich → Watchlist alert eval
       → Discord → SMS → email → push (sequential per rule)
  → Parallel product paths: dilution RISK_ONLY cron, calibration backfill
```

## Stage map

| Stage | Mechanism | Sync? | Typical lag drivers | Observability today |
|-------|-----------|-------|---------------------|---------------------|
| 0. Wake | Cron / worker timer | Async | Tier interval 10s–90s+ | Worker logs, `/admin/ingest` |
| 1. Fetch | `runSourceTick` → source fetchers | Sync per source; sources sequential in tier | Provider RTT, SEC politeness, rate permits | LatencyTrace `firstFetchedAt` |
| 2. Annotate / filter | `annotateFetchedArticles`, age/INVALID drop | Sync | Parse cost | Timestamp quality enum |
| 3. Idempotency | `filterFreshArticles` Redis NX | Sync | Redis RTT | Claim drop if crash before persist |
| 4. Verify / resolve | `verifyNewsArticle`, match confidence | Sync **blocking** | Ambiguous tickers | Quarantine table |
| 5. Classify | `analyzeNews` heuristics | Sync **blocking** | CPU (usually small) | `classifiedAt` |
| 6. Persist | `catalyst.upsert(rawNewsId)` | Sync | DB latency | `persistedAt` |
| 7. Enrich | Quotes / dilution / judgment / calibration | Mostly **async** fire-and-forget | Quote API, Finnhub | Partial; not on alert critical path for wire |
| 8. Feed publish | `prependToPublicFeedCache` | Sync write | Redis | `ssePublishedAt` |
| 9. In-app delivery | SSE polls cache every **2s** | Async | Up to ~2s after publish + client reconnect | `firstDeliveryAttemptAt` |
| 10. Alert eval | `dispatchWatchlistAlerts` | Async after enrich (wire) | User loop | AlertLog |
| 11. Channels | Discord → SMS → email → push | **Sequential awaits** | Slow SMS/email blocks later channels | AlertLog status only |

## Critical path (wire / Tier 0) — conceptual

```
provider_publish
  → [provider→fetch lag: schedule interval + RTT]
  → verify + classify + upsert          [ingestion→classification]
  → feed cache                          [classification→publish]
  → SSE poll ≤2s                        [publish→in-app]
  → [async] enrich → alert channels     [not on in-app path]
```

## Duplicate / gap risks (pre-V2)

1. Same story across sources → different `rawNewsId` → multiple catalysts/alerts  
2. Redis down → alert claims fail-open  
3. Idempotency claim then crash → event dropped until TTL  
4. No Last-Event-ID → reconnect may miss or re-fetch full snapshot  
5. Dilution cron + watchlist alert can both fire on same filing  
6. Channel serialization: slow SMS delays email/push for that dispatch

## What already exists (reuse)

- Tiered ingest, partition locks, idempotency, circuits, backoff, DLQ (`src/lib/ingest/*`)
- LatencyTrace + timestamp quality (`src/lib/latency-trace/*`)
- SSE heartbeats (12s) + client reconnect (3s)
- Alert claims (`alert:claim:{user}:{catalyst}:{channel}`)
- Admin ingest + latency dashboards

## Gaps Alert Backbone V2 must close

| Requirement | Pre-V2 gap |
|-------------|------------|
| Separate queues (filings / licensed / editorial / market / enrichment) | Inline in HTTP tick |
| Preliminary event before enrichment | Feed only after full classify+persist |
| Event versions / update without duplicate alerts | Row upsert; no versioned event id for channels |
| Persist queue state across restarts | No durable job queue |
| Channel isolation | Sequential channel awaits |
| Source connection heartbeats + gap backfill | Health counters only; no gap cursor |
| SSE Last-Event-ID | Absent |
| Per-channel delivery lifecycle timestamps | AlertLog status, not accepted→acked→expired |
| Stale suppress by category age | Flat 2h freshness |
| Synthetic E2E probes | Absent |
| Configurable SLOs | Marketing-adjacent claims elsewhere; not measured targets config |

## Configured service targets (not claims)

Targets live in `src/lib/alert-backbone/targets.ts` / env overrides.  
**Unset / unmet targets must never be advertised as achieved.**

Suggested defaults (configuration only):

| Metric | p50 target | p90 target |
|--------|------------|------------|
| Provider → ingestion | 15s | 60s |
| Ingestion → classification | 250ms | 2s |
| Classification → in-app delivery | 3s | 10s |
| Alert channel success rate | ≥ 95% | — |
| Duplicate alert rate | ≤ 2% | — |
| Data-gap count / hour | ≤ 5 | — |

## Assumptions for local/staging measurements

1. Redis (Upstash) available; without Redis, queues degrade to in-memory (not multi-instance safe).  
2. Provider “streaming” means **persistent worker wake + reconnect/backfill**, not a licensed Finnhub news WebSocket unless contractually wired.  
3. Classification remains heuristic on the critical path; LLM judgment stays off-path.  
4. Load tests simulate concurrency in-process; they are **not** production SLOs.

---

*Next: implement Alert Backbone V2 against this map.*

## Implementation status (post-map)

Alert Backbone V2 landed under `src/lib/alert-backbone/`. See:

- `docs/ALERT_BACKBONE_V2_LOAD_REPORT.md` — local load results + assumptions
- `/admin/alert-backbone` — source/channel/queue health (targets never auto-claimed)
- Cron `GET /api/cron/alert-backbone?probe=1` — drain queues + synthetic probe

Configured SLO env vars: `ALERT_SLO_*`, `ALERT_STALE_*`, `ALERT_BACKBONE_V2_ENABLED`, `ALERT_BACKBONE_PRELIMINARY_ENABLED`.
