# TrustTicker — Full Platform Functionality Matrix

**Program:** Full Platform Functionality + Real-Data Certification  
**Phase:** 0 — Baseline inventory (code inspection, not runtime certification)  
**Date:** 2026-08-17  
**Branch:** `main` (many uncommitted local changes present — see git status at audit time)  
**Product contract:** V2 single product — $19.99/mo · $149.99/yr · 7-day full trial · no permanent free tier

**Legend — STATUS**

| Status | Meaning |
|--------|---------|
| **WORKING** | Source → persistence → API → UI path exists; tests or prior certification evidence |
| **PARTIAL** | Shipped but incomplete, legacy, flag-gated, or missing test/runtime proof |
| **BROKEN** | User-visible surface wired but a required layer fails (confirmed in code) |
| **UNKNOWN** | Cannot certify without live DB/Stripe/network run |
| **NOT_SHIPPED** | No user-facing surface or explicitly future-phase |

**Legend — AUTH:** `Public` · `Login` · `Entitled` (`requireTrustTickerAccess`) · `Admin` · `Cron`

---

## Baseline environment (Phase 0)

| Item | Value |
|------|-------|
| Dev server | Not running in terminal 1 at audit (cwd only) |
| Playwright | `playwright.config.ts` — desktop/tablet/mobile + entitlement project |
| Vercel crons | `vercel.json` — 22 scheduled routes (hydrate, metrics, filings, 13F, wire, …) |
| Prisma models | 40+ models including Company Reality OS (`MetricObservation`, `CompanyEvent`, `ResearchCheckpoint`, …) |
| Prior certification | `docs/TRUSTTICKER_V2_LAUNCH_CERTIFICATION.md` (2026-08-17) — predates this program |
| Shared readiness | `src/lib/company-readiness/*` — datasets `READY|STALE|MISSING|PROCESSING|UNSUPPORTED|ERROR` |

---

## PUBLIC SURFACES

### Landing (`/`)

| Field | Detail |
|-------|--------|
| **STATUS** | WORKING |
| **Route** | `src/app/page.tsx` |
| **UI** | `src/components/landing/MarketingLanding.tsx` (+ snap slides, hero, product tour) |
| **API** | Optional session; `GET /api/public-stats` |
| **AUTH** | Public |
| **DATA** | SSR case study via calibration service; no live SEC |
| **TESTS** | `e2e/landing.spec.ts`, `e2e/interaction-audit.spec.ts`, `e2e/responsive-audit.spec.ts` |
| **KNOWN ISSUE** | Scroll-snap lock UX under review (CSS vs Meuze-style JS) |

### Pricing (`/pricing`)

| Field | Detail |
|-------|--------|
| **STATUS** | WORKING |
| **Route** | `src/app/pricing/page.tsx` |
| **UI** | `src/components/pricing/PricingPlanCards.tsx` |
| **API** | `POST /api/stripe/checkout` (Login) |
| **AUTH** | Public read; checkout requires session |
| **TESTS** | `e2e/pricing.spec.ts`, `e2e/entitlement-matrix.spec.ts` |

### Login / Register (`/login`)

| Field | Detail |
|-------|--------|
| **STATUS** | WORKING |
| **Route** | `src/app/login/page.tsx`, `LoginForm.tsx` |
| **API** | NextAuth, `POST /api/auth/register` |
| **AUTH** | Public; authed redirect to dashboard/demo |
| **TESTS** | `tests/signup-funnel.test.mts`, interaction audit |

### Legal (`/legal/*`)

| Field | Detail |
|-------|--------|
| **STATUS** | WORKING |
| **Routes** | `src/app/legal/{terms,privacy,cookies,disclaimer}/page.tsx` |
| **AUTH** | Public |
| **TESTS** | `e2e/access.spec.ts`, interaction audit |

### Status (`/status`)

| Field | Detail |
|-------|--------|
| **STATUS** | WORKING |
| **Route** | `src/app/status/page.tsx` |
| **API** | `GET /api/status` |
| **AUTH** | Public |
| **KNOWN ISSUE** | May show insufficient_data without production samples |

### Today (`/today`)

| Field | Detail |
|-------|--------|
| **STATUS** | WORKING |
| **Route** | `src/app/today/page.tsx` |
| **DATA** | `buildSessionPlan()` — public sample, no private portfolio |
| **AUTH** | Public |

### Public ticker hub (`/ticker/[symbol]`)

| Field | Detail |
|-------|--------|
| **STATUS** | PARTIAL |
| **Route** | `src/app/ticker/[symbol]/page.tsx` |
| **UI** | `src/components/ticker/*` tabs |
| **API** | Server `getTickerHubBundle`; client research overview (thesis stripped public) |
| **AUTH** | Public; entitled overlays for thesis/what-changed |
| **DB** | Catalyst, dilution, metrics, events (when hydrated) |
| **JOBS** | `npm run hydrate`, `/api/cron/hydrate`, ingest hooks |
| **TESTS** | `e2e/research.spec.ts`, `e2e/launch-critical-first-ticker.spec.ts`, `tests/research-workspace.test.mts` |
| **KNOWN ISSUE** | Anonymous thesis tab gated; depends on hydration for full tabs |

### Demo (`/demo`)

| Field | Detail |
|-------|--------|
| **STATUS** | WORKING |
| **Route** | `src/app/demo/page.tsx` |
| **UI** | `src/components/demo/EvidenceDemo.tsx` |
| **API** | `GET /api/demo` |
| **AUTH** | Public |

### Wins (`/wins`)

| Field | Detail |
|-------|--------|
| **STATUS** | WORKING |
| **Route** | `src/app/wins/page.tsx` |
| **DATA** | `getSpeedWins`, latency stats server-side |
| **AUTH** | Public |

### Case studies (`/case-studies`)

| Field | Detail |
|-------|--------|
| **STATUS** | WORKING |
| **Route** | `src/app/case-studies/page.tsx` |
| **API** | `GET /api/case-studies` |
| **AUTH** | Public; empty when none approved (intentional) |

---

## PRIVATE SURFACES — Dashboard shell

### Dashboard shell (`/dashboard`)

| Field | Detail |
|-------|--------|
| **STATUS** | WORKING |
| **Route** | `src/app/dashboard/page.tsx` → `TradingDashboard.tsx` → `DashboardShellV3.tsx` |
| **AUTH** | Login required; `hasTrustTickerAccess` for data loaders |
| **TESTS** | `e2e/dashboard-shell.spec.ts`, `e2e/primary-nav.spec.ts`, `tests/dashboard-shell.test.mts` |

### Portfolio (`view=portfolio` / desk `watchlist`)

| Field | Detail |
|-------|--------|
| **STATUS** | WORKING |
| **UI** | `PortfolioDesk.tsx`, `PortfolioBriefPanel` |
| **API** | `/api/portfolio`, `/api/portfolio/search`, `/api/portfolio/[id]` |
| **DB** | `PortfolioItem`, triggers coverage/hydration |
| **AUTH** | Entitled + AccessGate |
| **TESTS** | `e2e/primary-nav.spec.ts`, `tests/portfolio-layer.test.mts`, entitlement matrix |

### Watchtower (`view=watchtower`)

| Field | Detail |
|-------|--------|
| **STATUS** | WORKING |
| **UI** | `WatchtowerDesk.tsx`, `WatchtowerEventDrawer.tsx` |
| **Lib** | `src/lib/watchtower/service.ts` |
| **API** | `/api/watchtower`, `/api/watchtower/events/[id]` |
| **DB** | `CompanyEvent`, `UserCompanyEventState` |
| **JOBS** | Hydrate + ingest → company-events persist |
| **AUTH** | Entitled |
| **TESTS** | `e2e/watchtower.spec.ts`, `tests/watchtower-backend.test.mts`, `tests/watchtower-ui.test.mts` |
| **KNOWN ISSUE** | Empty feed copy needs readiness-aware states (Phase 2) |

### Research desk (`view=research`)

| Field | Detail |
|-------|--------|
| **STATUS** | WORKING (with broken fingerprint sub-feature) |
| **UI** | `ResearchDesk.tsx`, `ResearchTabPanels.tsx`, tab components |
| **API** | `/api/research/[symbol]/*`, `/api/ticker/[symbol]/*` |
| **AUTH** | Desk: Login; hydration enqueue: Entitled; many read APIs: Public |
| **TESTS** | `e2e/research.spec.ts`, `e2e/research-hydration.spec.ts`, `tests/research-workspace.test.mts` |

### Discover (`view=discover`)

| Field | Detail |
|-------|--------|
| **STATUS** | WORKING |
| **UI** | `DiscoverDesk.tsx` |
| **Lib** | `src/lib/discover/*` |
| **API** | `/api/discover/rules`, `/api/discover/search`; cron `/api/cron/discover` |
| **AUTH** | Entitled |
| **TESTS** | `tests/discover-rules.test.mts`, entitlement matrix |

### Settings (`/settings`)

| Field | Detail |
|-------|--------|
| **STATUS** | WORKING |
| **UI** | `src/components/settings/SettingsClient.tsx` |
| **API** | `/api/settings`, `/api/billing/status`, `/api/stripe/portal` |
| **AUTH** | Login |
| **TESTS** | `e2e/settings.spec.ts`, `e2e/a11y-keyboard.spec.ts` |

### Billing (Subscribe + Settings)

| Field | Detail |
|-------|--------|
| **STATUS** | WORKING (code) / UNKNOWN (live Stripe) |
| **Routes** | `/subscribe`, `/pricing`, Settings → Billing |
| **API** | checkout, portal, webhook, cancel-reason |
| **AUTH** | Login for checkout; webhook signature |
| **TESTS** | `e2e/settings.spec.ts`, `tests/billing-checkout.test.mts` |

### Alerts (Settings + rules panels)

| Field | Detail |
|-------|--------|
| **STATUS** | WORKING |
| **UI** | `AlertRulesPanel.tsx`, `AlertStrategyBuilder.tsx`, `AlertHistoryPanel.tsx` |
| **API** | `/api/alert-strategies`, `/api/alerts/*`, settings PATCH |
| **JOBS** | `/api/cron/alert-backbone` |
| **AUTH** | Rules: Entitled; channel prefs: Login |
| **TESTS** | `e2e/settings.spec.ts`, `tests/alert-strategy.test.mts` |
| **KNOWN ISSUE** | Delivery depends on optional Discord/Resend/Twilio/VAPID |

---

## RESEARCH TABS (in-desk + public ticker)

Shared coordinator: `ensureCompanyReady` · inspect · `CompanyHydrationJob` · `/api/cron/hydrate` · `npm run hydrate`

| Surface | STATUS | DB / source | Population job | API | UI | Tests | Known issue |
|---------|--------|-------------|----------------|-----|-----|-------|-------------|
| **Overview** | WORKING | Aggregates hub + events + thesis | Per-dataset hydrate | `GET /api/research/[symbol]/overview` | `ResearchOverview.tsx` | `research-workspace`, e2e | Generic "No X yet" blocks (Phase 2) |
| **Company State** | WORKING | `MetricObservation`, capital, insiders, ownership, events | hydrate | `GET /api/ticker/[symbol]/company-state` | `CompanyStatePanel.tsx` | `company-state.test.mts` | Dev message "Run hydrate" in UI |
| **Business Change Fingerprint** | **BROKEN** | `MetricObservation` via `fingerprint.ts` | Same as FINANCIALS | **Missing** `/api/ticker/[symbol]/business-fingerprint` | `BusinessChangeFingerprintGrid.tsx` | None | UI fetch 404 → silent empty |
| **What Changed** | WORKING | `CompanyEvent` | hydrate + ingest | `GET /api/ticker/[symbol]/what-changed` | `WhatChangedFeedClient.tsx` | `company-what-changed.test.mts` | Evidence array not rendered in cards |
| **Since Last Researched** | WORKING | `ResearchCheckpoint` + events | User checkpoint POST | `/api/research/[symbol]/since-last`, `/checkpoint` | `SinceLastResearchedPanel.tsx` | `research-since-last.test.mts` | — |
| **Thesis** | WORKING | `InvestmentThesis`, conditions, evals | User CRUD; cron thesis-health | `/api/thesis/*` | `ThesisPanel.tsx` | e2e thesis, hostile QA | Entitlement gate |
| **Thesis history** | WORKING | `ThesisRevision`, `ThesisEvaluation` | On eval/edit | `/api/thesis/[id]/history` | `ThesisHistoryTimeline.tsx` | `thesis-history.test.mts` | — |
| **Financials** | WORKING | `MetricObservation` | hydrate CompanyFacts | `/api/ticker/[symbol]/quarterly-delta` | `FinancialsTab.tsx` | `quarterly-delta.test.mts`, hydration e2e | Depends FINANCIALS READY |
| **Quarterly Delta** | WORKING | Same as Financials | Same | Same API | `QuarterlyDeltaTable.tsx` | Same | Incomparable periods must show unavailable |
| **Capital Risk** | WORKING | `CapitalRiskSnapshot`, `DilutionInstrument` | hydrate dilution + snapshot | `/api/ticker/[symbol]/capital-risk` | `CapitalTab.tsx` | `capital-risk.test.mts` | Shelf ≠ dilution (tested) |
| **Insiders** | WORKING | `InsiderTransaction` | hydrate Form 4 | `/api/ticker/[symbol]/insiders` | `InsidersTab.tsx` | Form 4 fixtures | Classification rules in `insider/classify.ts` |
| **Ownership 13D/G** | WORKING | `BeneficialOwnershipFiling` | hydrate ownership | `/api/ticker/[symbol]/ownership` | `OwnershipTab.tsx` | `ownership-13d.test.mts` | Confirmed-empty vs missing (Phase 2) |
| **Institutional 13F** | PARTIAL | `Institutional13fFiling`, snapshots | **cron only** `/api/cron/institutional-13f` | Part of ownership report | `OwnershipTab.tsx` (13F section) | `institutional-13f.test.mts` | Delayed label required; no on-demand hydrate |
| **Filings** | WORKING | `FilingSectionSnapshot` | hydrate + `/api/cron/filings` | `/api/ticker/[symbol]/filings` | `FilingsTab.tsx` | `filing-redlines.test.mts` | No live SEC in API |
| **Filing diffs** | WORKING | `FilingSectionSnapshot.diffJson` | Same as filings | Via filings API | FilingsTab redlines | `filing-redlines.test.mts` | — |
| **Timeline** | PARTIAL | `CompanyEvent` via what-changed | Same as events | Reuses what-changed | Inline list in `ResearchTabPanels.tsx` | Tab nav e2e only | Reduced vs full What Changed |
| **Evidence (tab)** | NOT_SHIPPED | `EvidenceRecord`, event evidenceJson | evidence sync | No Research evidence API | None dedicated | `evidence-model.test.mts` | Phase 13+ planned |

---

## OTHER PRODUCT SURFACES

| Surface | STATUS | Route / UI | API | AUTH | Tests | Notes |
|---------|--------|------------|-----|------|-------|-------|
| **Portfolio Brief** | WORKING | `PortfolioBriefPanel` | `/api/portfolio/brief` | Entitled | `portfolio-brief.test.mts` | New-event cutoff logic |
| **Alert history** | WORKING | Settings panel | `/api/alerts/history` | Entitled | settings e2e | User-scoped |
| **Markets Floor** | PARTIAL | `TradingFloor.tsx` | quotes, scanner | Entitled | — | Legacy deep-link |
| **Monitor / Scanner** | PARTIAL | `TrustTickerMonitor.tsx` | monitor/* | Entitled + flag | monitor e2e suite | Beta / flag-gated |
| **Popouts** | UNKNOWN | `/popout/[panel]` | varies | Login + sub | None | No e2e |
| **Institution page** | PARTIAL | `/institution/[cik]` | `/api/institution/[cik]/13f` | Public | None | Cron-dependent |
| **Prop Desk** | PARTIAL | `/desk` | same as dashboard | Entitled | None | Legacy layout |
| **Admin diagnostics** | WORKING | `/admin/*` | `/api/admin/*` | Admin | admin readiness tests | 13 admin pages |

---

## DATA PIPELINE (cross-cutting)

| Layer | Path | Notes |
|-------|------|-------|
| Identity | `src/lib/company-identity/*` | SymbolMaster, CIK |
| Coverage | `src/lib/coverage/*` | RESEARCH_INTEREST TTL |
| Hydration | `src/lib/company-readiness/hydrate.ts` | Single coordinator |
| Metrics | `src/lib/metrics/*` | CompanyFacts → MetricObservation |
| Capital | `src/lib/capital-risk/*`, `src/lib/dilution/*` | |
| Insiders | `src/lib/insider/*` | Form 4 |
| Ownership | `src/lib/ownership/*` | 13D/G |
| 13F | `src/lib/institutional/*` | Cron-only |
| Filings | `src/lib/filings/*` | Section snapshots |
| Events | `src/lib/company-events/*` | CompanyEvent spine |
| Company state | `src/lib/company-state/*` | Derived read model |
| Evidence | `src/lib/evidence/*` | Graph refs |

**Cron inventory:** see `docs/JOBS_V2.md` and `vercel.json`.

---

## TEST COVERAGE SUMMARY (Phase 0)

| Layer | Count / key files |
|-------|-------------------|
| Unit/integration | 104+ `tests/*.test.mts` |
| Playwright | 26+ specs in `e2e/` |
| Launch-critical | `e2e/launch-critical-first-ticker.spec.ts` |
| Research hydration | `e2e/research-hydration.spec.ts` |
| Entitlement matrix | `e2e/entitlement-matrix.spec.ts` |
| Gaps | Popouts, institution UI, Prop Desk, fingerprint API |

---

## PHASE 0 — CONFIRMED DEFECTS (launch-relevant)

| # | Surface | Defect | Severity |
|---|---------|--------|----------|
| 1 | Business Change Fingerprint | UI calls missing API route | **BROKEN — launch blocker for Overview trend snapshot** |
| 2 | Multiple Research empty states | "No X yet" without readiness/check context | **PARTIAL — Phase 2 target** |
| 3 | Company State panel | "Run hydrate" dev copy exposed to users | **PARTIAL — Phase 2 target** |
| 4 | DatasetStatusBanner | "No X is in TrustTicker yet" ambiguous | **PARTIAL — Phase 1/2 target** |
| 5 | Evidence tab | Not shipped as Research surface | **NOT_SHIPPED — documented** |

---

## PHASE 0 EXIT

- [x] Mandatory docs read (AGENTS, rules, context pack, readiness, jobs, route inventory)
- [x] Git status captured (large uncommitted WIP on `main`)
- [x] Dev server state checked
- [x] Playwright + Vercel cron config inspected
- [x] Every listed surface inventoried with code paths
- [x] No guessing on fingerprint API gap (verified 0 route files)
- [ ] Runtime certification — begins Phase 1+

**Next phase:** Phase 1 — Platform data-health contract (extend `CompanyDatasetState` vocabulary, reason codes, tests).
