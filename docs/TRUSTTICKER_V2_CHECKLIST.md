# TrustTicker V2 — Implementation Checklist

Track major systems from the V2 product brief and `docs/TRUSTTICKER_V2_IMPLEMENTATION.md`.  
Check items only when implemented, tested, and committed for that checkpoint.

---

## Planning & workflow

- [x] Persistent Cursor workflow rule (`.cursor/rules/trustticker-v2-workflow.mdc`)
- [x] Implementation plan document (`docs/TRUSTTICKER_V2_IMPLEMENTATION.md`)
- [x] This checklist (`docs/TRUSTTICKER_V2_CHECKLIST.md`)
- [x] Pre-migration quality baseline (`docs/V2_BASELINE.md`)

---

## Business model & entitlements

- [x] Remove permanent free Investor OS tier (OS requires trial or paid)
- [x] Single product entitlement (no Plus vs Pro feature differences)
- [x] 7-day trial grants **full** product access
- [x] Trial not restartable via route revisit / client state clear (`hasUsedTrial` + `TrialClaim`)
- [x] Paid pricing display: **$19.99/mo** and **$149.99/yr**
- [x] Monthly and annual unlock identical functionality
- [x] Server-side entitlement only (`requireEntitled` / equivalent)
- [x] Client UI hiding never sole protection
- [x] Trust webhook/DB state — never checkout-return query params for access
- [x] Legacy active Plus/Pro remain entitled until period end / cancel (no forced Stripe price change)
- [x] New checkout uses only new monthly/annual prices
- [x] Access matrix covered: anonymous, trial-eligible, active trial, expired trial, monthly, annual, cancel-at-period-end, canceled/expired, past_due, webhook delay, direct API, direct route, webhook replay

---

## Stripe & billing

- [ ] Stripe Price objects for $19.99 and $149.99 *(create in Stripe Dashboard / env — app code ready)*
- [x] Checkout API accepts interval only (no tier)
- [x] Webhook signature verification retained
- [x] Webhook updates status / period end / trial flags correctly
- [x] Webhook event idempotency
- [x] Duplicate open-subscription prevention retained
- [x] Billing portal manage/cancel path retained
- [x] No real charges in automated tests
- [x] Legacy price IDs still resolve as entitled in webhooks

---

## Data model (Prisma V2 foundation)

- [x] `PortfolioItem` (+ watchlist backfill / settings sync) — ADR §13
- [x] `CompanyEvent` + central event types (`src/lib/company-events/types.ts`)
- [x] `MetricObservation`
- [x] `InvestmentThesis` / `ThesisCondition` / `ThesisEvaluation`
- [x] `CapitalRiskSnapshot` (keeps `DilutionInstrument`)
- [x] `FilingSectionSnapshot`
- [x] `InsiderTransaction`
- [x] `InstitutionalHoldingSnapshot`
- [x] `UserCompanyEventState`
- [x] `NotificationDelivery` (keeps catalyst `AlertLog`)
- [x] Additive migration inspected + applied (`prisma/migrations/20260816200000_trustticker_v2_foundation`)

---

## Primary product surfaces (IA)

- [ ] **Portfolio** primary surface
- [ ] **Watchtower** primary surface
- [ ] **Research** primary surface
- [ ] **Discover** primary surface
- [ ] Dashboard shell / nav remapped (deprecate Markets/Structure as primary)
- [ ] Platform Guide updated + `PLATFORM_GUIDE_VERSION` bumped
- [ ] Loading / empty / error / success states on each primary surface
- [ ] Keyboard / focus behavior on interactive controls

---

## Company workspace (per ticker)

- [ ] Overview tab
- [ ] What Changed tab
- [ ] Thesis tab
- [ ] Financials tab
- [ ] Capital tab
- [ ] Insiders tab
- [ ] Ownership tab
- [ ] Filings tab
- [ ] Timeline tab
- [ ] Public research-preview vs entitled full depth defined and enforced
- [ ] Source/evidence links retained where practical
- [ ] Unknown/Unavailable — never fabricate zeros

---

## Core capabilities

### Portfolio monitoring

- [ ] Entitled users monitor a portfolio/watchlist without free-tier caps
- [ ] Portfolio-scoped queries always `session.user.id`
- [ ] Mutations validated and rate-limited

### What Changed

- [ ] Portfolio-scoped event feed
- [ ] Deterministic event significance
- [ ] Evidence/source on events

### Thesis

- [ ] User-defined investment thesis conditions
- [ ] Thesis Health evaluation
- [ ] Thesis CRUD scoped to session user
- [ ] Alerts on thesis breaches (as designed)

### SEC & company events

- [ ] SEC event detection (existing 8-K / 4 / capital forms retained)
- [ ] Polite, bounded, idempotent SEC ingestion
- [ ] Extended events as needed without paid data vendors

### Financials

- [ ] Financial metric deltas
- [ ] Quarterly Delta
- [ ] UNKNOWN never silently becomes zero

### Capital risk & dilution

- [ ] Capital Risk surface
- [ ] Dilution monitoring (reuse `src/lib/dilution/*`)
- [ ] Shelf registration ≠ actual dilution in UX/copy/logic

### Insiders

- [ ] Form 4 parsing beyond headline heuristics
- [ ] Insider context (disposition ≠ automatic open-market sale)

### Ownership

- [ ] 13D/13G ownership events
- [ ] 13F institutional change tracking
- [ ] 13F not presented as real-time

### Filings

- [ ] Filing list with source links
- [ ] Filing section comparisons / redlines

### Briefs & alerts

- [ ] Personalized Portfolio Brief
- [ ] High-signal alerts
- [ ] Custom monitoring rules
- [ ] SMS/Twilio not required

### Research & Discover

- [ ] Source-grounded research (no fabricated facts)
- [ ] Discover opportunity rules (no buy/sell recommendations)

---

## Explicit non-goals (must remain absent)

- [ ] No AI price predictions
- [ ] No generated buy/sell recommendations
- [ ] No social sentiment product
- [ ] No paid market-data dependency required
- [ ] No paid news dependency required
- [ ] No mandatory LLM API
- [ ] No mandatory Redis
- [ ] No mandatory Finnhub
- [ ] No options flow product
- [ ] No Level 2 market data product
- [ ] Informational-only / not investment advice disclaimers retained

---

## Cost & optional services

- [ ] Core path works on SEC + free RSS/PR + Postgres + Vercel-compatible jobs
- [ ] Finnhub absent → graceful degrade
- [ ] Redis absent → graceful degrade
- [ ] Twilio absent → product fully usable
- [ ] LLM absent → deterministic facts still work
- [ ] No new paid infrastructure/API introduced without explicit approval

---

## Security & compliance (ongoing)

- [ ] Private queries scoped by `session.user.id`
- [ ] Never accept client `userId` as authorization
- [ ] Cron fail-closed in production
- [ ] Least-privilege Prisma selects
- [ ] No secret leakage in public/ticker APIs
- [ ] Negative authorization tests for new protected routes
- [ ] Settings allowlist — no mass-assign of Stripe/subscription fields

---

## Engineering quality gates (per checkpoint)

- [ ] Prefer reuse/refactor over rewrite
- [ ] Strict TypeScript — no `@ts-ignore` / broad eslint-disable to hide issues
- [x] Migrations additive when schema changes
- [x] Targeted tests + applicable `lint` / `typecheck` / `test` / e2e / `build`
- [ ] Auto-commit only after validation; never push unless requested

---

## Deprecation / cleanup (after entitlements stable)

- [ ] Freemium Free/Plus/Pro marketing copy removed or redirected
- [ ] `requirePlus` / Plus-only gates removed or aliased to entitled
- [ ] `FREE_WATCHLIST_LIMIT` product gate removed
- [ ] Stale guide / landing / pricing references audited
- [ ] Legacy trader surfaces deep-linked or explicitly retained — decision documented

---

## Implementation order (checkpoint tracker)

- [x] 1. Entitlement core + access matrix tests
- [x] 2. Stripe single-SKU migration
- [x] 3. API gate sweep → `requireEntitled`
- [ ] 4. Nav IA: Portfolio / Watchtower / Research / Discover + guide bump
- [ ] 5. Company workspace tab shell
- [ ] 6. CompanyEvent / What Changed engine
- [ ] 7. Thesis + Thesis Health
- [ ] 8. Portfolio Brief
- [ ] 9. Capital Risk / dilution surfacing
- [ ] 10. Financials / Quarterly Delta
- [ ] 11. Ownership (13D/13G/13F)
- [ ] 12. Filing redlines
- [ ] 13. Discover rules
- [ ] 14. Hardening (idempotency, e2e matrix, verify)
