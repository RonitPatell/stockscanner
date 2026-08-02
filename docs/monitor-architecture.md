# TrustTicker Monitor — Architecture Audit & Design

**Status:** Design only (no production Monitor feature code in this document).  
**Audience:** Engineers implementing Monitor as a bounded product surface on the existing TrustTicker V2 repository.  
**Constraints:** Global TrustTicker requirements (informational only; no execution; no personalized buy/sell; no unverified latency claims; session-scoped security; Platform Guide on major UI).

---

## 1. Current market-data flow

```
Yahoo Finance v7 batch (~1.2s)  ±  Finnhub WS trades (opt-in, default OFF)
        │
        ▼
scripts/quote-stream.mjs
        │  Redis quotes:v2 + quotes:live:ts
        │  OR POST /api/quotes/ingest (memory mode)
        ▼
src/lib/quote-cache-service.ts  (getCachedQuotes / refreshQuoteCache)
        │
        ├─► GET /api/quotes          (Pro, cache-first + Finnhub fill)
        ├─► GET /api/quotes/stream   (Pro SSE; polls cache 0.5–1s)
        └─► mergeQuotesIntoFeed / catalyst-engine enrich
                │
                ▼
        LiveQuoteProvider (browser) → desk UI / Decision Drawer
```

**Secondary paths**

| Path | Role |
|------|------|
| `fetchQuote` / `fetchQuoteLive` / `fetchQuoteTrusted` (`market-data.ts`) | On-demand Finnhub REST when cache cold |
| `fetchVolumeForSymbol` | Daily + 5m candles → volume / avg for RVol |
| `profile-cache-service` | Float / mcap (Finnhub profile2), Redis `profiles:v1` 24h |
| `index-quotes.ts` | VIX via Finnhub/`^VIX` + Yahoo chart fallback |
| `market-scanner.ts` | Wire alerts + heavy volume leaders → Redis `scanner:snapshot:v1` |

**Honest label:** There is **no licensed L1/NBBO consolidated tape** in the default path. “Live” means worker freshness (`quotes:live:ts` &lt; 12s), not exchange tick entitlement. Depth/L1 features are gated by `MARKET_DATA_L1_LICENSED` (`tradeability/entitlements.ts`).

---

## 2. Current news-data flow

```
Tiered fetchers (ingest/sources.ts + news-sources/* + market-data Finnhub)
        │
        ▼
annotate → age/INVALID filter → peek idempotency (ingest/idempotency-store)
        │
        ▼
ingestAndAnalyzeNews (catalyst-engine)
  verifyNewsArticle → assessMatchConfidence → quarantine|reject|create Catalyst
  markArticlesSeen only after DB success / already-known
        │
        ▼
feed-cache (feed:all:v1 / feed:movers:v1) + Alert Backbone enqueue
        │
        ├─► GET /api/catalysts + SSE /api/catalysts/stream (2s poll)
        ├─► GET /api/feed
        └─► watchlist alerts / Alert Strategy evaluate / Focus rank
```

| Tier | Sources (typical) | Cadence (adaptive) |
|------|-------------------|--------------------|
| 0 | SEC EDGAR, GlobeNewswire, Business Wire, PR Newswire | ~8–12s |
| 1 | Finnhub market, fast editorial RSS, Polygon news (optional) | ~10–60s |
| 2 | Finnhub company, Yahoo ticker RSS | ~30s |
| 3 | Slow commentary RSS | ~60s |

**Orchestration:** `priority-ingest-worker.mjs` → `/api/cron/ingest-tier`. Vercel `/api/cron/wire` + `/api/cron/ingest` are a **1–2 min safety net**, not the realtime path (`docs/REALTIME_DESK.md`).

**Master flag:** `PRIORITY_INGEST_ENABLED` (default on). Off → legacy `ingestWireBurst`.

---

## 3. Existing event contracts (summary)

Full field-level contracts: [`monitor-event-contracts.md`](./monitor-event-contracts.md).

| Contract | Location | Notes |
|----------|----------|-------|
| `NewsArticle` + ingest trace | `types/`, `ingest/annotate` | Timestamp quality MISSING/INVALID/… |
| Catalyst row / public catalyst | Prisma `Catalyst`, `public-catalyst.ts` | `rawNewsId` unique; judgment JSON |
| `CachedQuote` / `LiveQuote` | `quote-cache-service`, `LiveQuoteProvider` | Structural, lightly validated |
| Alert Backbone envelope | `alert-backbone/types.ts`, `events.ts` | `preliminary` \| `enriched` \| `expired` |
| Alert Strategy AST | `alert-strategy/types.ts` | Versioned snapshots in Prisma |
| Decision Card V3 model | `decision-card/types.ts` | `decision-card-v3.0` |
| Reaction stage | `reaction-stage/types.ts` | `reaction-stage-v1.0` |
| Tradeability | `tradeability/types.ts` | `tradeability-v1.0` |
| Halt snapshot | `halt-monitor/` | Official resume only when published |
| Judgment V2 | `judgment/types.ts` | `judgment-v2.0` |
| Squawk script | `squawk/types.ts` | `squawk-v1.0` |
| Focus rank result | `focus-mode/rank.ts` | Max 5; floor score 55 |
| Coverage / match | `coverage/types.ts` | Quarantine floors |

---

## 4. Current update frequencies

| Surface | Frequency |
|---------|-----------|
| Yahoo quote worker | **~1.2s** (`QUOTE_STREAM_MS`) |
| Quote flush coalesce | **~1s** |
| Finnhub WS (if enabled) | Tick / trade messages |
| Quote SSE poll | **0.5s** if live else **1s** |
| Client profile/RVol poll | **8s** (SSE live) / **2s** (fallback) |
| Catalyst SSE | **2s** |
| LiveScanner REST recovery | **12s** |
| Wire tier 0 | **~8–12s** |
| Wire tier 1 | **~10s** |
| Full ingest cron | **~2 min** |
| Scanner snapshot Redis | TTL **120s** |
| Feed Redis | TTL **30 min** |
| Profiles Redis | TTL **24h** |
| Quote Redis (app / worker) | TTL **30s / 45s** |
| Live heartbeat | Fresh if &lt; **12s** |
| Coverage / SymbolMaster cron | Hours (6–48h reason TTLs) |
| Platform health UI | **8s** |

---

## 5. Tick-level vs per-second vs polled vs cached

| Class | Inputs |
|-------|--------|
| **Tick-level** | Finnhub WS trades → price only; % recomputed via `repriceFromTick` (worker + `quote-cache-service`) |
| **Per-second polled** | Yahoo batch quotes; quote SSE cache reads; catalyst SSE cache reads |
| **Per-minute / multi-second polled** | Wire tiers; scanner; client feed recovery; Finnhub REST queue (~1.15s spacing) |
| **Cached long-lived** | Profiles (24h), SymbolMaster, coverage reasons, earnings (7d), feed snapshot (30m) |
| **Estimated (not measured)** | `estimateRvolFromMove` when volume missing; illustrative slippage without L1 |

---

## 6. Data licensing assumptions (code / docs)

> **Monitor vendor-neutral layer:** see `docs/monitor-market-data-licensing.md` — redistribution rights are **UNRESOLVED** until manually verified. Implementation lives under `src/domain/monitor/market-data/` (pure) and `src/adapters/monitor/market-data/` (Yahoo/Finnhub/fake adapters).

| Source | Assumption in repo |
|--------|--------------------|
| SEC + issuer PR wires | Redistribution-permitted for delayed demo (`demo/licensing.ts`) |
| Finnhub / Yahoo / editorial RSS | Body text **redacted** in public demo; operational use for Pro desk |
| Stock Titan | Explicitly **not** available / not claimed (`REALTIME_DESK.md`) |
| Benzinga | Removed by product choice; still listed as licensed/editorial in demo redact set |
| Polygon news | Optional; ~hourly on typical Stocks plans |
| L1 depth / NBBO | Requires `MARKET_DATA_L1_LICENSED`; otherwise tradeability marks depth unavailable |
| Sub-5s publish→desk | Documented as requiring **licensed low-latency wire + always-on worker** — not claimed for free RSS |
| Yahoo scrape | Product ops path (“no US residency”); **not** a legal clearance for redistribution |

Monitor must not imply exchange-entitled ticks or redistribution rights beyond `demo/licensing.ts` and ToS.

---

## 7. Client / server boundaries

| Layer | May |
|-------|-----|
| **Browser** | Call Pro APIs (`/api/quotes`, `/api/quotes/stream`, `/api/catalysts*`, settings). Hold UI state. TTS squawk. Never hold provider API keys. |
| **Next.js route handlers** | `requirePro` / `requireUser` / `authorizeCron` / `requireAdmin`. Prisma + Redis + domain engines. |
| **Workers** (Railway/Fly) | `realtime-worker` → priority ingest + quote-stream; cron-auth to app URL. |
| **Cron** | Fail-closed without `CRON_SECRET` (except local `next dev`). |

**Ownership rule:** never trust client `userId`; session only (see `.cursor/rules/security.mdc`).

---

## 8. Modules that can be reused

| Module | Why |
|--------|-----|
| `ingest/*` tiers, idempotency, circuits | Proven multi-source ingest |
| `feed-cache` + catalyst SSE pattern | Shared snapshot delivery |
| `quote-cache-service` + quote SSE | Shared tape cache |
| `coverage/*` + `symbol-master` | Universe + why-we-cover |
| `news-verifier` + `match-assess` | Ticker resolution + quarantine |
| `alert-backbone/*` | Versioned event envelopes + queues |
| `alert-strategy` evaluate/simulate/version/explain | Rules engine (UI optional) |
| `reaction-stage/*` | Observational stage machine |
| `tradeability/*` | Liquidity realism (keep unavailable honest) |
| `halt-monitor/*` | Official halt lifecycle |
| `judgment` build-v2 + `present` | Five-dimension separation |
| `decision-card/project` | Pure composition projector |
| `dilution` extract/persist/radar | SEC-first dilution |
| `squawk` privacy/queue/script | Audio without leaking bodies |
| `focus-mode/rank` | Attention ranking (rename semantics for Monitor) |
| `calibration/*`, `reliability/*` | Replay / ops metrics |
| Prisma models listed in § schema | Persistence contracts |
| Tests under `tests/*.test.mts` for engines above | Regression safety net |

---

## 9. Modules that should be replaced (for Monitor product)

| Module | Why replace / not port as-is |
|--------|------------------------------|
| Dashboard Shell V3 destinations IA | Catalyst-desk IA ≠ Monitor visualization IA |
| Prop Desk denselayout | Different session product |
| Platform Guide copy (v35) | New tour + `data-guide` targets for Monitor |
| Catalyst Feed V3 row chrome + desk A–F as “conviction” | Attention ≠ momentum ≠ recommendation |
| Legacy GO/WATCH/SKIP trade-judgment panels | Conflicts with global requirements |
| Alert Strategy Builder UI presets named `*_momentum` | Naming traps; keep engine |
| Marketing latency claims / cherry-picked wins UI | Must use sample-gated production metrics only |
| Duplicate RVol estimators in `market-scanner` / `quote-stream` | Standardize before Monitor momentum state |

---

## 10. Bounded contexts (Monitor)

Dependency rule: **domain modules must not import React, Prisma, Redis, Stripe, browser APIs, or route handlers.** Adapters (infra / UI / HTTP) depend inward.

```
                         Reliability & Operations
                                    ▲
                                    │
 Market Data Ingestion ──► Market Feature Computation ──► Momentum State
         │                                                      │
         │                                                      ▼
         │                                              Attention Priority
         │                                                      │
         ▼                                                      ▼
 Catalyst Intelligence ──► Personalization ──────────► Monitor Delivery
                                                               │
                                                               ▼
                                                     Monitor Visualization

 Replay & Calibration  (reads snapshots from Momentum / Features / Catalyst)
```

### Context definitions

#### Market Data Ingestion
- **Owns:** Raw quote/trade/volume fetches, provider adapters, freshness heartbeats, watchlist of symbols to poll.
- **Inputs:** Yahoo, Finnhub (REST/WS), optional licensed L1 later.
- **Outputs:** Versioned `MarketTick` / `MarketSnapshot` DTOs (quality: verified | estimated | stale | unavailable).
- **Must not:** Compute Monitor attention scores; call Prisma for user prefs.

#### Market Feature Computation
- **Owns:** RVol (single definition), session volume factor, dollar volume windows, day-range features, spread when entitled.
- **Inputs:** Snapshots from Ingestion.
- **Outputs:** `MarketFeatures` with `ruleVersion` + `featureVersion`.
- **Must not:** Import React; invent depth without entitlement.

#### Momentum State
- **Owns:** Observational momentum intensity bands (e.g. QUIET / BUILDING / ACTIVE / EXTENDED / COOLING) with hysteresis — **not** a trade recommendation.
- **Inputs:** MarketFeatures only (+ optional halt freeze).
- **Outputs:** `MomentumState` + explainable contributions.
- **Must not:** Read `urgencyScore`, desk A–F, Focus score, or sentiment as inputs.

#### Attention Priority
- **Owns:** Ordering of what the Monitor surfaces (who appears in the viewport). Separate from Momentum State.
- **Inputs:** Momentum State, Catalyst Intelligence signals, Personalization weights, risk flags.
- **Outputs:** Ranked `AttentionItem[]` with explicit reasons.
- **Must not:** Present as “best trade” or expected edge.

#### Monitor Delivery
- **Owns:** SSE/WS fanout, snapshots, backpressure, authz (`requirePro`), idempotent event ids.
- **Inputs:** Attention + Momentum + Catalyst projections.
- **Outputs:** Wire events to clients (contracts in `monitor-event-contracts.md`).
- **Adapters may:** Redis, route handlers. Domain core stays pure.

#### Monitor Visualization
- **Owns:** React UI for Monitor surface, keyboard a11y, `data-guide` targets.
- **Inputs:** Delivery events only (via hooks).
- **Must not:** Fetch Yahoo/Finnhub; recompute momentum differently from server.

#### Catalyst Intelligence
- **Owns:** News verify, Judgment V2, Decision Card projection, reaction stage, dilution, halt card — existing engines reused behind this context.
- **Outputs:** Catalyst-aware overlays for Attention (materiality, risk), never merged into Momentum State.

#### Personalization
- **Owns:** Watchlist, alert strategies, mute lists, Focus-like filters — session-scoped.
- **Adapters:** Prisma User / AlertStrategyVersion.

#### Replay and Calibration
- **Owns:** Historical feature/momentum snapshots, outcome joins (`CatalystOutcome`, reaction transitions), calibration reports.
- **Must not:** Cherry-pick latency; require sample gates for public claims.

#### Reliability and Operations
- **Owns:** Health, heartbeats, DLQ, circuit breakers, admin requireAdmin surfaces, ingest/quote lag metrics with honest labels.

---

## 11. Proposed package / folder layout (greenfield inside repo)

```
src/domain/monitor/
  market-data/          # pure types + ports (no I/O)
  features/             # pure feature math
  momentum/             # pure state machine
  attention/            # pure ranking
  contracts/            # shared DTOs / versions

src/adapters/monitor/
  market-data/yahoo.ts
  market-data/finnhub.ts
  redis/
  prisma/
  http/                 # route handlers call here

src/app/(monitor)/…     # UI routes (feature-flagged)
src/components/monitor/ # visualization only
```

Existing engines stay under `src/lib/{reaction-stage,tradeability,…}` initially; Monitor domain **imports their pure projectors**, while `persist.ts` files remain adapters. Longer-term: move pure engines behind `src/domain/` and leave Prisma in adapters (migration PRs below).

---

## 12. Hazard register

### Circular dependencies (watch / known risks)

| Risk | Notes |
|------|-------|
| `catalyst-engine` ↔ `quote-cache` ↔ `profile-cache` ↔ ingest | Large hub; Monitor must not deepen the hub |
| `decision-card/project` → judgment + reaction + tradeability + halt | OK if one-way; avoid reverse imports from engines into card UI barrels |
| `alert-backbone` → ingest idempotency keys | Acceptable; don’t import backbone from quote-stream |

### Client/server barrel-export hazards

| Hazard | Mitigation |
|--------|------------|
| `export *` from packages that also export `persist.ts` (Prisma) | Split `index.ts` into `index.ts` (pure) + `server.ts` (persist); `"use client"` modules import only pure |
| `LiveQuoteProvider` in shared barrels pulled into workers | Keep provider under `components/` only |
| Judgment/decision flags reading `NEXT_PUBLIC_*` inside pure build | Keep flag reads at UI/API edge |

Known `export *` barrels: `dilution`, `analogue`, `alert-strategy`, `reliability`, `calibration`, `squawk`, `trader-feedback` — audit before Monitor UI imports them from client components.

### Duplicate momentum / intensity calculations

| Location | What |
|----------|------|
| `volume-utils.computeRvol` | Session-adjusted (canonical candidate) |
| `quote-stream.mjs` RVol | Unadjusted volume/avg |
| `market-scanner` RVol / heat | Different estimators (`abs/8`, `abs/6`) |
| `estimateRvolFromMove` | abs%/4.5 |
| `symbolHeat` in quote-stream | Ad-hoc heat |
| Scanner `type: "momentum"` alerts | Product label |
| `ai.computeUrgency` | Keyword urgency on **news**, not tape |

**Monitor rule:** one `features` module owns RVol + intensity; deprecate duplicates behind adapters.

### Conflicting data types

| Type | Conflict |
|------|----------|
| `StockQuote` vs `CachedQuote` vs `LiveQuote` | Required vs optional volume; OHLC presence |
| `CatalystItem.rVol` vs cache estimate | `mapPublicCatalyst` may recompute from volume only and drop estimates |
| Profile stub `{ price: 0 }` | Can poison “has quote” checks if not guarded |
| Reaction / Judgment stage enums | String unions parallel Decision Card liquidity enums — map explicitly |

### Paths that can bypass or weaken ticker verification

| Path | Risk |
|------|------|
| Wire ingest `skipQuoteCheck` | Skips Finnhub tradeability quote check under load |
| `fetchQuoteTrusted` | No US-exchange gate |
| Verifier without Finnhub key | Accepts lower confidence without quote |
| Quote APIs | Format-only validation — not news about-check (OK for quotes, not for attaching news) |
| SEC CIK map | Symbol from filing map; still should pass match assess before publish |

Monitor Attention that joins news→symbol must go through `assessMatchConfidence` / quarantine; never attach unverified headlines to momentum rows silently.

### Scores that must **not** be reused as Momentum State

| Score | Correct use | Incorrect use |
|-------|-------------|-----------------|
| `urgencyScore` | News freshness/type heuristic | Tape momentum |
| `sentimentScore` | Tone heuristic | Edge / direction certainty |
| Focus / squawk priority | Attention ordering | “Best trade” |
| Desk letter A–F | Catalyst desk scan priority | Momentum intensity |
| Judgment GO/WATCH/SKIP (legacy) | Do not primary-display | Any Monitor badge |
| Alert preset `low_float_momentum` | Strategy id only | Market momentum state |
| Scanner `momentum` alert type | Wire&volume product | Domain Momentum State |
| Illustrative slippage | Warning copy | Fill quality guarantee |

Global product separation (already in Judgment `present.ts`):  
**momentum intensity ≠ attention priority ≠ tradeability ≠ directional implication ≠ risk.**

---

## 13. Prisma schema (relevant)

| Model | Monitor use |
|-------|-------------|
| `Catalyst` | Catalyst Intelligence input |
| `SymbolMaster` / `SymbolCoverage` | Universe |
| `MatchQuarantine` | Ambiguous tickers |
| `ReactionStageSnapshot` / `Transition` | Overlay / calibration |
| `TradeabilitySnapshot` / `Transition` | Overlay |
| `HaltSnapshot` / `HaltTransitionLog` | Freeze / badge |
| `DilutionInstrument` / `Conflict` | Risk overlay |
| `AlertStrategyVersion` / `AlertLog` | Personalization delivery |
| `CatalystOutcome` / calibration tables | Replay |
| `LatencyTrace` | Ops (honest metrics) |
| *(no Quote table)* | Quotes remain Redis/memory unless Monitor adds snapshot table for replay |

**Proposed additive models (later PRs, not now):** `MonitorFeatureSnapshot`, `MomentumStateSnapshot`, `MonitorAttentionSnapshot` — versioned, explainable, TTL’d or time-series.

---

## 14. Feature flags (existing + proposed)

| Flag | Today | Monitor |
|------|-------|---------|
| `PRIORITY_INGEST_ENABLED` | on | Keep |
| `ALERT_BACKBONE_V2_ENABLED` | on | Keep |
| `JUDGMENT_V2_ENABLED` | **off** by default | Enable for Catalyst overlays |
| `DECISION_CARD_V3_ENABLED` | **off** by default | Enable for drawer reuse |
| `NEXT_PUBLIC_DASHBOARD_SHELL_V3` | dev default on | Independent of Monitor |
| `NEXT_PUBLIC_FOCUS_MODE_V2` | opt-in prod | Attention cousin; don’t couple |
| **`MONITOR_ENABLED` / `NEXT_PUBLIC_MONITOR_ENABLED`** | — | **Proposed** default off |
| **`MONITOR_MOMENTUM_V1`** | — | Proposed domain version gate |
| **`MARKET_DATA_L1_LICENSED`** | exists | Required for depth features |

---

## 15. Tests to extend (do not delete)

| Area | Files |
|------|-------|
| Ingest | `tests/priority-ingest.test.mts` |
| Coverage | `tests/dynamic-coverage.test.mts` |
| Alert backbone / strategy | `tests/alert-backbone*.mts`, `alert-strategy.test.mts` |
| Decision / drawer | `tests/decision-card-v3.test.mts`, `decision-drawer.test.mts` |
| Reaction / tradeability / halt | `tests/reaction-stage.test.mts`, `tradeability.test.mts`, `halt-monitor.test.mts` |
| Judgment | `tests/judgment-v2.test.mts`, `judgment-presentation.test.mts` |
| Dilution | `tests/dilution-radar-v2.test.mts` |
| Focus / squawk | `tests/focus-mode-v2.test.mts`, `squawk-focus.test.mts` |
| Feed / shell | `tests/catalyst-feed-v3.test.mts`, `dashboard-shell.test.mts` |
| Calibration | `tests/calibration.test.mts` |
| E2E | `e2e/workflow-audit.spec.ts`, focus/drawer/shell/visual-system |

**New test packs (planned):** `tests/monitor-features.test.mts`, `monitor-momentum.test.mts`, `monitor-attention.test.mts`, `monitor-contracts.test.mts` — pure domain first.

---

## 16. Migration & rollout

See [`monitor-rollout.md`](./monitor-rollout.md) for phased flags, PR breakdown, and cutover. Summary:

1. **Contracts + domain pure packages** (no UI).  
2. **Unify RVol/features** behind adapters (behavior-compatible).  
3. **Momentum State v1** + snapshots (flagged).  
4. **Delivery SSE** + Attention (flagged).  
5. **Visualization** + Platform Guide bump.  
6. **Calibration / ops** + sample-gated metrics.  
7. Gradual enablement; TrustTicker Feed remains default until Monitor GA.

---

## 17. Relationship to TrustTicker desk

| TrustTicker desk | Monitor |
|------------------|---------|
| Catalyst-first feed + Decision Drawer | Tape/momentum-first viewport + catalyst overlays |
| Desk grade A–F on news rows | Momentum State + separate Attention rank |
| Shell V3 destinations | New surface `/monitor` (name TBD) behind flag |
| Same ingest + quotes workers | Same workers; new consumers |

Both surfaces share Catalyst Intelligence and market ingestion; they **must not** share a single “score” that collapses momentum + attention + recommendation.
