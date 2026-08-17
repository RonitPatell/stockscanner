# Company Reality OS — Architecture Inventory

**Product mission:** Research a company once. TrustTicker keeps the research alive.

**Date:** 2026-08-17  
**Status:** Phase 0 baseline — no major product behavior changes in this document.

This inventory maps what exists today in `stockscanner` (TrustTicker V2), what the Company Reality OS adds conceptually, and how to implement without duplicating hydration, SEC ingestion, or entitlement systems already shipped.

Related docs: `docs/COMPANY_READINESS_ARCHITECTURE.md`, `docs/COMPANY_DATA_COMPATIBILITY.md`, `docs/HISTORICAL_STATE.md`, `docs/TRUSTTICKER_DATA_RETENTION_CERTIFICATION.md`.

---

## 1. Current persistence models (reuse, do not duplicate)

| Model | Role today | Evidence Graph role |
|-------|------------|-------------------|
| `SymbolMaster` | Ticker → CIK, name, exchange | **Identity** node |
| `SymbolCoverage` | Why symbol is monitored (incl. `RESEARCH_INTEREST`) | Coverage / hydration trigger |
| `CompanyDatasetState` | Per-dataset readiness (`IDENTITY`, `FINANCIALS`, …) | Freshness gate for read models |
| `CompanyHydrationJob` | On-demand hydration queue (one row/symbol) | Job orchestration (unchanged) |
| `MetricObservation` | Normalized SEC CompanyFacts + derived metrics | **Financial evidence** (immutable facts) |
| `CapitalRiskSnapshot` | Point-in-time capital-risk rollup | **Capital state** snapshot |
| `DilutionInstrument` | Shelf/ATM/warrant/convertible rows | **Capital evidence** |
| `InsiderTransaction` | Structured Form 4 | **Insider evidence** |
| `BeneficialOwnershipFiling` | 13D/G extracts | **Ownership evidence** |
| `InstitutionalHoldingSnapshot` / `Institutional13fFiling` | 13F (delayed) | **Ownership evidence** (labeled) |
| `FilingSectionSnapshot` | 10-Q/10-K section hash + diff | **Filing change evidence** |
| `CompanyEvent` | Unified event tape (financial, capital, insider, …) | **Company Change** atoms + Watchtower feed |
| `InvestmentThesis` | User thesis per symbol | **Investor Memory** (private) |
| `ThesisCondition` | Automated/manual conditions | **Revisit conditions** |
| `ThesisEvaluation` | Point-in-time eval snapshots | Historical condition truth (threshold frozen) |
| `ThesisRevision` | Immutable thesis/condition edits | Investor Memory timeline |
| `PortfolioItem` | User monitored symbols | Portfolio scope |
| `UserCompanyEventState` | Read/dismiss on shared events | Watchtower UX state |
| `ProductAnalyticsEvent` | Privacy-conscious funnel events | Retention metrics |
| `NotificationDelivery` | Alert delivery log | Alert backbone |

**Do not** create parallel tables for SEC XBRL rows, Form 4 rows, or filing bodies when references to the above suffice.

---

## 2. Current domain services (extend, do not rewrite)

### Identity & hydration (production-proven)

| Path | Responsibility |
|------|----------------|
| `src/lib/company-identity/*` | `resolveCompanyIdentity`, SEC `company_tickers.json` |
| `src/lib/company-readiness/*` | `ensureCompanyReady`, `hydrateCompanySymbol`, cron drain |
| `src/lib/coverage/*` | `RESEARCH_INTEREST`, SymbolMaster refresh |
| `scripts/hydrate-company.mts` | Local operator hydration |
| `src/app/api/cron/hydrate/route.ts` | Vercel cron (fail-closed) |

### Financial read models

| Path | Responsibility |
|------|----------------|
| `src/lib/metrics/*` | Extract, normalize, persist, quarterly delta |
| `src/lib/metrics/get-quarterly-delta.ts` | SSR/API financial read model |
| `src/app/api/ticker/[symbol]/quarterly-delta/route.ts` | Public financial API |

### Capital / dilution

| Path | Responsibility |
|------|----------------|
| `src/lib/capital-risk/*` | Evaluate, liquidity, share structure, snapshot |
| `src/lib/dilution/*` | Instrument extract, timeline |

### Insiders / ownership / filings

| Path | Responsibility |
|------|----------------|
| `src/lib/insider/*` | Form 4 fetch/parse/persist |
| `src/lib/ownership/*` | 13D/G |
| `src/lib/institutional/*` | 13F cron |
| `src/lib/filings/*` | Section extract, diff, persist, cron |

### Company events & What Changed

| Path | Responsibility |
|------|----------------|
| `src/lib/company-events/*` | Classify, persist, significance |
| `src/lib/ticker-what-changed/*` | Feed builder, windows, thesis overlay |
| `src/app/api/ticker/[symbol]/what-changed/route.ts` | Feed API |

### Research & Portfolio

| Path | Responsibility |
|------|----------------|
| `src/lib/research/*` | Overview composer, recent symbols |
| `src/components/research/*` | Research desk tabs, readiness banners |
| `src/lib/portfolio-brief/*` | Personalized brief |
| `src/lib/watchtower/*` | Change-first feed, thesis relevance |

### Thesis / Investor Memory (partial)

| Path | Responsibility |
|------|----------------|
| `src/lib/thesis/*` | CRUD, health evaluate/run |
| `src/lib/thesis/history.ts` | Revisions + evaluation history |
| `src/app/api/thesis/[id]/history/route.ts` | Session-scoped history |

### Discover (exists, evidence-light)

| Path | Responsibility |
|------|----------------|
| `src/lib/discover/*` | Rules, facts, search evaluate |

### Analytics

| Path | Responsibility |
|------|----------------|
| `src/lib/analytics/track.ts` | Funnel event allowlist |
| `src/lib/analytics/retention.ts` | Persist + admin funnel aggregates |

---

## 3. Current read models & APIs

| Surface | Read path | Auth |
|---------|-----------|------|
| Research readiness | `GET /api/research/[symbol]/readiness` | Entitled enqueue; public inspect |
| Research overview | `GET /api/research/[symbol]/overview` | Public strips thesis |
| Financials | `GET /api/ticker/[symbol]/quarterly-delta` | Public (shared facts) |
| Capital | `GET /api/ticker/[symbol]/capital-risk` | Public |
| Insiders / Ownership / Filings | `/api/ticker/[symbol]/*` | Public |
| What Changed | `GET /api/ticker/[symbol]/what-changed` | Entitled thesis overlay |
| Portfolio Brief | `GET /api/portfolio/brief` | `requireTrustTickerAccess` |
| Watchtower | `GET /api/watchtower` | Entitled |
| Thesis | `/api/thesis*` | Session user scoped |

**Invariant:** Page render and Research tabs must not live-fetch SEC or external APIs. Hydration/cron/adapters write DB; UI reads DB.

---

## 4. Functionality to reuse (no second implementations)

1. **Hydration coordinator** — single `hydrateCompanySymbol` for CLI + cron + dev route.
2. **MetricObservation** — canonical financial facts; Company State Engine reads this.
3. **CompanyEvent** — canonical change atoms; What Changed / Watchtower / Brief consume.
4. **ThesisEvaluation snapshots** — threshold-at-evaluation-time; extend for Revisit, do not rewrite history.
5. **ThesisRevision** — investor memory timeline; extend with research status, not duplicate.
6. **Quarterly Delta** — period-comparable YoY/QoQ; fingerprint uses for Financials tab.
7. **CapitalRiskSnapshot + DilutionInstrument** — capital dimension; shelf ≠ issuance language already enforced in tests.
8. **FilingSectionSnapshot.diffJson** — filing change evidence.
9. **ProductAnalyticsEvent** — extend event enum for Reality OS funnel (Phase 22).
10. **Discover evaluate** — extend filters from Company State / events, not new screener engine.

---

## 5. Functionality needing extension

| Area | Gap | Planned module |
|------|-----|----------------|
| Unified evidence references | Claims scattered across models | `EvidenceRef` / graph (Phase 1) |
| Company State summary | Only tab-level loaders | `src/lib/company-state/*` (Phase 2) |
| Business Change Fingerprint | No multi-window trend grid | `src/lib/company-state/fingerprint.ts` (Phase 3) |
| Research hierarchy | Overview is event/metric fragments | Phase 4 overview redesign |
| Since last researched | `last-view.ts` exists but thin | Phase 5 checkpoint + delta |
| Research status | No WATCHING/RESEARCHING/OWNED/PASSED | Phase 6 on `InvestmentThesis` or sibling |
| Revisit conditions | Thesis conditions only | Phase 7 broaden types + alerts |
| Research checkpoints | None | Phase 8 user-scoped rows |
| External evidence | None | Phase 9–12 adapters + Reality tab |
| EvidenceCard UI | Ad hoc per tab | Phase 13 component |
| Compare | None | Phase 14 |
| Portfolio exposures | None | Phase 15 user-confirmed tags |
| Public ticker preview | Hub only | Phase 19 bounded state sample |

---

## 6. Duplication to avoid

- **Do not** add `FinancialFact`, `SecFact`, or second metric tables — use `MetricObservation`.
- **Do not** add parallel hydration queues or identity tables.
- **Do not** store full SEC document text in Evidence Graph — reference `FilingSectionSnapshot`, accession, `sourceUrl`.
- **Do not** rebuild Watchtower from catalysts only — `CompanyEvent` is the spine.
- **Do not** generate buy/sell scores, target prices, or opaque 0–100 ratings.
- **Do not** live-fetch USAspending / ClinicalTrials.gov in React render paths.
- **Do not** reintroduce Free/Plus/Pro gates — `requireTrustTickerAccess` only.

---

## 7. Proposed Evidence Graph (conceptual)

```
COMPANY (symbol, cik)
  ├── IdentityEvidence      → SymbolMaster + resolveCompanyIdentity
  ├── FinancialEvidence     → MetricObservation[*]
  ├── CapitalEvidence       → DilutionInstrument, CapitalRiskSnapshot, capital CompanyEvents
  ├── InsiderEvidence       → InsiderTransaction, insider CompanyEvents
  ├── OwnershipEvidence     → BeneficialOwnershipFiling, InstitutionalHoldingSnapshot
  ├── FilingEvidence        → FilingSectionSnapshot
  ├── ExternalEvidence      → NEW: ExternalEvidenceRecord (Phase 1/9+)
  │
  ├── CompanyState          → DERIVED read model (Phase 2): growth, profitability, cash, …
  ├── CompanyChanges        → CompanyEvent + since-checkpoint deltas (Phase 5)
  │
  └── UserResearch (private, session.user.id)
        ├── InvestmentThesis + ThesisRevision + ThesisEvaluation
        ├── RevisitConditions (ThesisCondition extended)
        ├── ResearchCheckpoints (Phase 8)
        ├── PortfolioItem + exposure tags (Phase 15)
        └── Alerts → NotificationDelivery
```

Every user-visible **claim** should resolve to:

- evidence type / category  
- source type + source id + source URL  
- occurred/reported/period dates  
- calculation method if derived  
- availability: Verified | Derived | Reported | Unknown  

---

## 8. Implementation order (matches master plan)

| Phase | Deliverable | Depends on |
|-------|-------------|------------|
| 0 | This document | — |
| 1 | Evidence model + `EVIDENCE_MODEL.md` | — |
| 2 | Company State Engine | Metrics, Capital |
| 3 | Business Change Fingerprint | State engine history |
| 4 | Research overview hierarchy | State + fingerprint |
| 5 | Since last researched | Checkpoints + What Changed |
| 6 | Investor Memory | ThesisRevision (exists) |
| 7 | Revisit engine | Thesis conditions + alerts |
| 8 | Research checkpoints | User state |
| 9 | External adapter framework | Evidence model |
| 10 | USAspending adapter | Framework |
| 11 | ClinicalTrials/FDA adapter | Framework |
| 12 | Reality tab | Adapters + read models |
| 13 | EvidenceCard system | State + changes |
| 14 | Compare | State engine |
| 15 | Portfolio Reality Map | Exposures |
| 16 | Portfolio Reality Brief | Brief + state |
| 17 | Watchtower change-first | Events + relevance |
| 18 | Evidence-based Discover | State + events |
| 19 | Public ticker preview | State (bounded) |
| 20–34 | Marketing, activation, audits, E2E, certification | Prior phases |

---

## 9. Security implications

- **Session ownership:** All private rows (`InvestmentThesis`, checkpoints, exposures, portfolio) filtered by `session.user.id`. Never accept client `userId`.
- **Entitlement:** Research enqueue, Portfolio Brief, Watchtower personalized overlays, thesis APIs → `requireTrustTickerAccess` or session-scoped read with public stripping.
- **Cron / adapters:** `authorizeCron` fail-closed; external fetch only in cron/worker/adapter jobs, bounded concurrency, SSRF-safe URL validation (`safeHttpUrl`).
- **Analytics:** `scrubTrackProps` — no thesis text, emails, secrets in `ProductAnalyticsEvent`.
- **Admin:** Company readiness admin, funnel, ops — `requireAdmin`.
- **Public ticker:** Strip thesis, checkpoints, revisit conditions, portfolio membership; bounded sample only.
- **13F / government / clinical:** Always label data freshness and what the data is *not* (award ≠ revenue, trial status ≠ success).

---

## 10. Data-correctness implications

- **UNKNOWN → never 0** — enforced in metrics layer; Company State must propagate null.
- **Instant vs duration** — balance-sheet vs P&L; trend rules must use comparable periods only.
- **Amendments** — later filing wins same fiscal period (compatibility tests).
- **Capital** — shelf registration ≠ actual dilution; ATM/warrant classification from existing dilution pipeline.
- **Insiders** — grant ≠ open-market purchase; disposition ≠ automatic sale; 10b5-1 when known.
- **Ownership** — 13D/G vs 13F; 13F delayed disclosure in UI copy.
- **External** — government award activity ≠ GAAP revenue; trial phase change ≠ approval.
- **Trend labels** — Improving/Stable/Deteriorating/Mixed/Unknown only when deterministic rules pass unit tests.

---

## 11. Cost implications

- **Core path stays free-data:** SEC EDGAR, public RSS/wires, optional Finnhub/Yahoo — product must work without paid providers.
- **No page-render external calls** — USAspending / ClinicalTrials refresh on cron with TTL + `CompanyDatasetState` or adapter-specific freshness rows.
- **Reuse hydration bounds** — do not expand unbounded SEC or external polling per user click.
- **Evidence payloads** — store references + normalized fields, not full document dumps.
- **Indexes** — evidence refs by `(symbol, occurredAt)`, `(symbol, sourceType)`, fingerprint dedupe.
- **Redis optional** — job checkpoints and ops stamps already degrade to memory.
- **13F** — remains separate heavy cron; not on-demand.

---

## 12. Current maturity snapshot (2026-08-17)

| Capability | Status |
|------------|--------|
| RKLB Financials hydration | Proven locally (READY, 645 observations) |
| Research readiness UI | Shipped (PROCESSING → READY) |
| Quarterly Delta / Financials tab | Shipped |
| Capital Risk | Shipped (Unknown states valid) |
| What Changed feed | Shipped (thesis overlay entitled) |
| Thesis history | Shipped (revisions + eval snapshots) |
| Portfolio Brief | Shipped |
| Company State Engine | **Not yet** |
| Evidence Graph unified refs | **Not yet** |
| External Reality adapters | **Not yet** |
| Since last researched | **Partial** (`last-view.ts`) |
| Research checkpoints | **Not yet** |

---

## 13. Phase 0 exit criteria

- [x] Inventory documented  
- [x] Reuse vs extend vs avoid listed  
- [x] Evidence Graph relationships defined  
- [x] Implementation order aligned to master plan  
- [x] Security, correctness, cost captured  

No product code changes required for Phase 0 beyond this document and a lightweight audit test hook.
