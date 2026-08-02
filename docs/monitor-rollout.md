# TrustTicker Monitor — Migration & Rollout Plan

**Status:** Implementation in progress — staged production control plane lives under `src/domain/monitor/rollout` + `/admin/monitor-ops`.  
**Principle:** Many small PRs. No mega-commit. Feature-flag everything trader-visible. Preserve TrustTicker desk.  
**Ops docs:** [Release checklist](./monitor-release-checklist.md) · [Rollback runbook](./monitor-rollback-runbook.md)

Do **not** describe beta metrics as achieved service guarantees.

---

## 1. Goals

1. Ship **TrustTicker Monitor** as a bounded surface: tape features → momentum state → attention → delivery → UI.  
2. Reuse Catalyst Intelligence engines without collapsing them into “momentum scores.”  
3. Keep global requirements: informational only; session ownership; honest data quality; Platform Guide on UI changes.  
4. Avoid breaking Feed / Prop Desk / Alert Backbone.

---

## 2. Non-goals (v1)

- Brokerage execution  
- Licensed L1 depth unless `MARKET_DATA_L1_LICENSED`  
- Replacing Shell V3 Feed  
- Claiming sub-second or sub-5s news latency on free RSS  
- Single composite “edge score”

---

## 3. Phased rollout

| Phase | Name | Exit criteria |
|-------|------|----------------|
| **P0** | Docs + flags + folder scaffolding | Docs merged; `MONITOR_ENABLED` default off; CI green |
| **P1** | Domain contracts + pure features/momentum | Unit tests; no UI; no Prisma in domain |
| **P2** | Adapters (quotes → snapshots → features) | Parity tests vs `volume-utils`; staging stream dry-run |
| **P3** | Attention + delivery SSE | Pro-gated; load-tested; dual-run with existing quotes SSE |
| **P4** | Visualization + Guide | Flagged `/monitor`; Guide version bump; a11y smoke |
| **P5** | Personalization hooks | Watchlist/strategy filters; no buy/sell copy |
| **P6** | Replay + calibration + ops | Snapshots; sample-gated metrics; admin requireAdmin |
| **P7** | Limited GA | Internal dogfood → % rollout → default-on for Pro (optional) |

Each phase = multiple PRs (below). Do not combine phases.

---

## 4. Dependency direction (enforced in review)

```
UI / route handlers / workers
        ↓
adapters/monitor/*
        ↓
domain/monitor/*   (pure)
        ↓
shared contracts (types only)
```

**Domain may not import:** React, Prisma, Redis, Stripe, `next/*`, browser APIs, route handlers.

**Lint/CI follow-ups (dedicated PRs):** eslint boundary rules or `dependency-cruiser` for `src/domain/monitor/**`.

---

## 5. Proposed pull-request breakdown

### Wave A — Foundation (P0)

| PR | Title | Contents | Risk |
|----|-------|----------|------|
| **A1** | docs: Monitor architecture audit | `docs/monitor-architecture.md`, `monitor-event-contracts.md`, `monitor-rollout.md` (this set) | None |
| **A2** | chore: Monitor feature flags (default off) | `MONITOR_ENABLED`, `NEXT_PUBLIC_MONITOR_ENABLED`, `MONITOR_MOMENTUM_V1` helpers mirrored after existing flag style | None |
| **A3** | chore: domain/adapter folder scaffolding | Empty `src/domain/monitor/*` + `src/adapters/monitor/*` + README boundary note; no behavior | None |

### Wave B — Contracts & pure domain (P1)

| PR | Title | Contents | Risk |
|----|-------|----------|------|
| **B1** | feat(monitor): Field/Availability + market snapshot types | Types + zod/io-ts optional later; unit tests for unavailable rules | Low |
| **B2** | feat(monitor): market features pure module | Canonical RVol using `volume-utils` algorithms **moved or wrapped**; no scanner duplicates yet | Low |
| **B3** | feat(monitor): momentum state machine v1 | Bands + hysteresis + explain; tests with fixtures; **no urgencyScore inputs** | Low |
| **B4** | feat(monitor): attention ranker v1 | Separate from momentum; reasons codes; tests | Low |
| **B5** | test(monitor): contract golden fixtures | `tests/monitor-contracts.test.mts` | Low |

### Wave C — Deduplicate tape math (P2, behavior-compatible)

| PR | Title | Contents | Risk |
|----|-------|----------|------|
| **C1** | refactor: single session volume factor | Dedupe `market-scanner` private copy → `volume-utils` | Medium — compare scanner snapshots in staging |
| **C2** | refactor: quote-stream RVol uses shared helper | Worker calls shared formula (or documents intentional difference temporarily with flag) | Medium |
| **C3** | adapter: CachedQuote → MarketSnapshotEvent | Server-only mapper; reject `price: 0` as ok without flags | Low |
| **C4** | adapter: snapshot → features pipeline | Wire into existing quote ingest path behind `MONITOR_MOMENTUM_V1` | Medium |

### Wave D — Persistence & delivery (P2–P3)

| PR | Title | Contents | Risk |
|----|-------|----------|------|
| **D1** | prisma: Monitor snapshot models (additive) | `MonitorFeatureSnapshot`, `MomentumStateSnapshot` — nullable, indexed `symbol+asOf` | Low (migrate forward-only) |
| **D2** | adapter: persist momentum snapshots | Prisma only in adapter; TTL/cleanup cron stub | Low |
| **D3** | api: `GET /api/monitor/snapshot` | `requirePro` + flag; rate-limit | Low |
| **D4** | api: `GET /api/monitor/stream` SSE | Pattern from quotes stream; heartbeats; sequence | Medium |
| **D5** | ops: monitor health fields on `/api/health` or `/status` | Honest labels; no SLA claims | Low |

### Wave E — Catalyst overlays (P3)

| PR | Title | Contents | Risk |
|----|-------|----------|------|
| **E1** | adapter: catalyst → CatalystOverlayEvent | Uses judgment present + reaction + tradeability + halt + dilution | Low |
| **E2** | attention: merge overlay reasons | Quarantined catalysts excluded; match confidence gated | Medium |
| **E3** | enable Judgment V2 / Decision Card flags in staging | Config-only PR for staging env | Low |

### Wave F — Visualization (P4)

| PR | Title | Contents | Risk |
|----|-------|----------|------|
| **F1** | ui: `/monitor` shell behind flag | Empty state + feature flag gate; no fake data | Low |
| **F2** | ui: momentum band + feature fields | Consume stream; show availability states | Medium |
| **F3** | ui: attention list + keyboard nav | a11y; no buy/sell copy | Medium |
| **F4** | ui: catalyst overlay drawer reuse | Decision Drawer projector; deep link | Medium |
| **F5** | docs: Platform Guide Monitor steps | Bump `PLATFORM_GUIDE_VERSION`; `data-guide` targets | Required with F1–F4 |

**Do not** ship F2–F5 in one PR.

### Wave G — Personalization (P5)

| PR | Title | Contents | Risk |
|----|-------|----------|------|
| **G1** | attention: watchlist boost / mute | Session-scoped Prisma reads in adapter | Low |
| **G2** | optional: strategy filter bridge | Read-only evaluate; no new alert spam by default | Medium |
| **G3** | squawk hooks (optional) | Reuse privacy scrub; Monitor-specific scripts | Low |

### Wave H — Replay, calibration, GA (P6–P7)

| PR | Title | Contents | Risk |
|----|-------|----------|------|
| **H1** | replay API requireAdmin | Cursor-based frames | Low |
| **H2** | calibration report job | Join outcomes; min sample gates | Medium |
| **H3** | e2e: monitor smoke | Playwright flagged path | Low |
| **H4** | rollout: cohorts 1→6 + gates | `MONITOR_ROLLOUT_STAGE`, ops attestations, sticky % | Ops |
| **H5** | docs: release checklist + rollback runbook | `docs/monitor-release-checklist.md`, `docs/monitor-rollback-runbook.md` | Low |

---

## 6. What each wave reuses vs replaces

| Wave | Reuse | Replace / avoid |
|------|-------|-----------------|
| B–C | `volume-utils`, quote cache | Scanner/Yahoo duplicate formulas as sources of truth |
| D | quotes/catalysts SSE patterns | New ad-hoc WebSocket without auth |
| E | judgment, reaction, tradeability, halt, dilution | `urgencyScore` as momentum |
| F | Decision Drawer projector | Feed V3 desk grade as Monitor conviction |
| G | Alert strategy evaluate, squawk privacy | Preset names as domain bands |
| H | calibration package, latency traces | Cherry-picked wins |

---

## 7. Environment & ops checklist

### Vercel (app)

```text
MONITOR_ENABLED=false                 # until GA
NEXT_PUBLIC_MONITOR_ENABLED=false
MONITOR_MOMENTUM_V1=false
JUDGMENT_V2_ENABLED=true              # staging first
DECISION_CARD_V3_ENABLED=true         # staging first
NEXT_PUBLIC_DASHBOARD_SHELL_V3=true   # desk parity unrelated but often desired
UPSTASH_REDIS_REST_URL / TOKEN
CRON_SECRET
FINNHUB_API_KEY
```

### Worker (Railway/Fly)

```text
NEXT_PUBLIC_APP_URL=https://www.trustticker.com
CRON_SECRET=<same>
FINNHUB_WS_ENABLED=false              # keep off unless quota solved
QUOTE_STREAM_MS=1200
```

### Verification

1. Desk Feed still updates with Monitor flags off.  
2. With flags on in staging: `/monitor` shows bands + availability, never “Buy”.  
3. Quarantined symbols do not appear as verified catalyst overlays.  
4. `/status` metrics remain sample-gated.  
5. Platform Guide opens and spotlights Monitor targets after F5.

---

## 8. Risk register

| Risk | Mitigation |
|------|------------|
| RVol definition change shifts scanner leaders | C1/C2 behind compare logs; shadow metrics |
| SSE load doubles | Share Redis snapshots; poll coalescing; rate limits |
| Barrel exports pull Prisma into client | Split `index.ts` / `server.ts` before F2 |
| Attention confused for recommendation | Copy review + Guide + contract disclaimers |
| Ticker bypass attaches wrong news | E2 quarantine gate; no skip of match assess |
| Scope creep into mega-PR | Reject PRs spanning multiple waves |

---

## 9. Rollback

See **[monitor-rollback-runbook.md](./monitor-rollback-runbook.md)** for the operational procedure.

| Layer | Rollback |
|-------|----------|
| Control plane | One-click rollback on `/admin/monitor-ops` (`ONE_CLICK_ROLLBACK`) |
| UI | Set `NEXT_PUBLIC_MONITOR_V1=false` + redeploy (fallback) |
| Stream | `MARKET_STREAM_V1` / `MONITOR_LIVE_DELIVERY=false` |
| Domain compute | Disable calculation version or subsystem env flags |
| Migrations | Additive only; do not drop columns in v1 |
| Worker | Unaffected if adapters no-op when flags off |
| User | Per-user `monitorBetaOptOut` + Feed / `?shell=legacy` |

---

## 10. Success metrics (observational — not profit)

- Time-to-first-momentum-event after quote worker healthy  
- % of momentum states with full `explain[]`  
- % overlays suppressed due to quarantine (should be &gt; 0 when dirty data exists)  
- SSE reconnect success rate  
- Zero Sev-1: client provider key leak, cross-user attention leak, execution CTAs  

Do **not** use P&amp;L or win-rate of users as a Monitor v1 success metric.

---

## 11. Immediate next PR

**A1 (this documentation set)** → then **A2 flags** → **A3 scaffolding** → **B1 types**.

Do not start UI until Wave B tests are green and Wave C has a written RVol parity plan.
