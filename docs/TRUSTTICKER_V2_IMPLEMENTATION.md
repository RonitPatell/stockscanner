# TrustTicker V2 — Implementation Plan

**Status:** Planning only (no product implementation in this document’s commit).  
**Product job:** Watch my investments for me and tell me when something materially changes.  
**Repo:** `stockscanner` (Next.js App Router, Prisma/Neon, Stripe, NextAuth JWT).

---

## 1. Current architecture discovered

### Stack
- **App:** Next.js 16 (App Router), React, TypeScript, Turbopack.
- **DB:** Prisma + PostgreSQL (Neon). App-level row security (no Postgres RLS).
- **Auth:** NextAuth credentials + JWT session (`src/lib/auth.ts`). Session carries `user.id` only — entitlements are re-loaded from DB in API guards / SSR.
- **Billing:** Stripe Checkout + Customer Portal + signed webhooks (`src/lib/stripe.ts`, `src/app/api/stripe/*`).
- **Optional:** Upstash Redis (rate limit / cache), Finnhub, Twilio SMS, Resend, web-push, Polygon — all should remain non-mandatory.
- **Ingest:** Adaptive multi-source runner (`src/lib/ingest/sources.ts`) with SEC EDGAR Atom (8-K, Form 4, 424B5, S-1/S-3 ± amendments), PR wires, RSS, optional Finnhub/Polygon.
- **Alerts:** Discord / email / push / optional SMS; `alertRules` + Alert Strategy Builder; trial abuse via `TrialClaim` hashes.

### Entitlements today (freemium — conflicts with V2)
| Concept | Implementation |
|--------|----------------|
| Tiers | `User.planTier`: `free` \| `plus` \| `pro` |
| Access helpers | `hasActiveSubscription`, `resolvePlanTier`, `hasPlusAccess`, `hasProAccess`, `FREE_WATCHLIST_LIMIT=15` |
| API gates | `requireUser`, `requirePlus`, `requirePro` (`src/lib/api-guard.ts`) |
| Prices (display) | Plus $19/$149; Pro $49/$399 (`src/lib/stripe.ts`) |
| Checkout | Body `{ plan: monthly\|annual, tier: plus\|pro }`; Stripe trial 7 days when `!hasUsedTrial && !hasTrialClaim` |
| Legacy | Active paid with empty tier → treated as **pro** |
| UI | Dashboard allows **free** logged-in users; Markets/Structure paywalled to Pro; Portfolio default |

Most live market APIs (`/api/feed`, `/api/quotes`, `/api/dilution`, scanner, monitor, session-plan, …) use **`requirePro`**. Settings enforces watchlist limit + Plus for saving `alertRules`.

### Primary UI today
- Desk modes (`panel-prefs.ts`, storage `tt-desk-mode-v5`): **Portfolio | Research | Markets | Structure** (+ deep-link news/scanner).
- Shell: `DashboardShellV3` + `TradingDashboard` + legacy panels (Call Board, Monitor, Speed Edge, etc.).
- Public: `/`, `/pricing`, `/ticker/[symbol]` (hub via `ticker-hub.ts`), `/today`, `/demo`, `/wins`.
- Guide: `PLATFORM_GUIDE_VERSION = 57` — freemium Investor OS copy.

### Data domains that already exist
- **Catalysts** — shared `Catalyst` rows + feed cache + judgment JSON.
- **Dilution** — `DilutionInstrument` / conflicts; extract → persist → radar → timeline → risk alerts (`src/lib/dilution/*`). Distinguishes capacity vs announced sale (important for V2 Capital Risk).
- **Ticker hub** — public aggregation of catalysts, Form 4 classification by headline heuristics, dilution badge.
- **Monitor domain** — large advanced trader surface (momentum, delivery, snapshots) — not aligned with V2 primary nav but reusable for event urgency patterns.
- **User private** — `watchlist[]`, `alertRules`, strategies, briefs prefs, Stripe fields.

### Gaps vs V2 product (not first-class today)
No dedicated models/engines for: **Watchtower**, **Discover**, user **Thesis** / Thesis Health, **What Changed** feed, deterministic **event significance**, **Quarterly Delta**, **13D/13G**, **13F** tracking, **filing redlines**, personalized **Portfolio Brief** as a core product object, **Discover opportunity rules**. Form 4 is ingest + headline classify, not full structured insider context. SEC Atom set does **not** yet include 13D/13G/13F.

### Stripe / trial behavior today
- Checkout blocks second open subscription (DB + live Stripe list); portal redirect on conflict.
- Webhook verifies signature; updates `subscriptionStatus`, `subscriptionEndsAt`, `planTier`, `hasUsedTrial`; records `TrialClaim`.
- **No Stripe event-id idempotency table** — replays re-apply updates (mostly safe but not audited).
- Success URL query `?subscribed=true&tier=` is UX-only; access still from DB — but dashboard **celebrates** query params (must not become entitlement source).
- `past_due` / `unpaid` block new checkout via `isOpenSubscriptionStatus` but **`hasActiveSubscription` does not grant access** unless `subscriptionEndsAt` is still in the future.

### Tests / e2e
- Unit: `tests/*.test.mts` (subscription-guards, dilution-radar, dashboard-shell, alert-backbone, monitor*, …).
- E2E: Playwright under `e2e/` (dashboard-shell, monitor, workflow-audit, focus-mode, …) — heavy on trader Monitor, light on freemium/billing matrix.

---

## 2. Existing functionality we should reuse

| Area | Reuse as |
|------|----------|
| `hasActiveSubscription` + Stripe status/`subscriptionEndsAt` | Core of single **entitled** check (extend for trial + past_due policy) |
| `TrialClaim` + `hasUsedTrial` + checkout `allowTrial` | Non-restartable trial (keep durable; do not rely on client) |
| `requireUser` / centralized `api-guard` | Evolve to `requireEntitled()` (one product) |
| SEC EDGAR ingest + politeness | Foundation for event detection; extend form types carefully |
| Catalyst pipeline + idempotent `rawNewsId` | Backbone for What Changed / filings timeline |
| Dilution extract/radar/timeline/types | Capital Risk / Capital tab; keep shelf ≠ dilution semantics |
| `ticker-hub.ts` patterns | Expand into company tabs (Overview, Filings, Capital, Insiders) |
| Watchlist on `User` | Portfolio holdings list (may later add quantity/cost as optional JSON — only if needed) |
| `alertRules` / alert backbone / strategies | High-signal alerts + custom monitoring rules |
| Email brief prefs / cron brief paths | Personalized Portfolio Brief delivery |
| Stripe checkout/portal/webhook skeleton | New single price IDs; keep signature verify + single-open-sub |
| Public marketing + `/ticker` preview | Allowed public research-preview surfaces |
| Platform Guide infra | Bump version when nav becomes Portfolio / Watchtower / Research / Discover |
| Dashboard shell exclusive-mode pattern | Remap primary modes; keep deep-links for legacy trader tools if retained |

---

## 3. Existing functionality we should deprecate

**Deprecate (product / gating), do not necessarily delete code on day one:**

| Item | Why |
|------|-----|
| Permanent **Free** Investor OS tier | V2: trial or paid only for OS functionality |
| **Plus vs Pro** feature split | One entitlement; monthly/annual same features |
| Display prices $19/$49/$149/$399 as tiered SKUs | Replace with **$19.99/mo** and **$149.99/yr** for **new** checkout |
| `requirePlus` / `hasPlusAccess` / `FREE_WATCHLIST_LIMIT` as product gates | Unlimited watchlist for any entitled user |
| Primary nav **Markets** / **Structure** as paid-only modules | Replace with **Watchtower** / **Discover**; dilution lives under Capital / Watchtower |
| Marketing copy for Free/Plus/Pro freemium | Pricing + landing + guide |
| Client `planTier === "pro"` as sole UI gate without server entitlement | Replace with server-resolved `entitled: boolean` (+ optional `accessReason`) |
| Reliance on checkout-return query for access | Keep as toast UX only |
| SMS/Twilio as implied core channel | Optional only; never required for V2 value |
| Mandatory Finnhub/Redis/LLM for core facts | Keep optional/fail-soft |

**Retain as secondary / deep-link (optional later product decision):** TrustTicker Monitor, Prop Desk trader tools, Call Board, paper ledger, squawk — useful engineering, not V2 primary surfaces. Prefer hide/deep-link over deleting.

---

## 4. Database changes anticipated

Prefer **extend** over duplicate models.

### Entitlements / billing
- Keep `subscriptionStatus`, `subscriptionEndsAt`, `subscriptionId`, `stripeCustomerId`, `hasUsedTrial`.
- **Migrate meaning of `planTier`:** either (a) stop using for gating and treat any active/trialing as entitled, mapping legacy `plus`/`pro` → entitled; or (b) introduce `entitlement` / boolean derived column — prefer (a) with clear helpers to avoid dual sources of truth.
- Optional: `cancelAtPeriodEnd Boolean`, `billingInterval` (`monthly`|`annual`), `stripePriceId` snapshot for support — **do not auto-change Stripe prices**.
- Optional: `StripeWebhookEvent` (`eventId` unique) for replay-safe processing.

### Portfolio / thesis / rules (new or JSON-first)
- **Thesis:** new `InvestmentThesis` (userId, symbol, conditions JSON, status, healthScore?, updatedAt) **or** versioned JSON on user if volume is tiny — prefer table for query-by-symbol alerts.
- **MonitoringRule / DiscoverRule:** may extend `alertStrategies` / `alertRules` with typed schemas before new tables.
- **Portfolio position metadata** (shares, cost basis): optional JSON map on User — only if product requires; not required for “watchlist monitoring.”

### Events / evidence
- **CompanyEvent** or normalized event table: symbol, type, significance, sourceUrl, accession, evidence JSON, occurredAt — either new model or strict subtype on `Catalyst` + judgment. Prefer additive fields on Catalyst **or** parallel `CompanyEvent` linked by accession/`rawNewsId` for idempotency.
- **FilingDocument / FilingSection** for redlines: accession, form, sectionKey, textHash, priorAccession — new if redlines ship.
- **OwnershipEvent** (13D/13G) and **InstitutionalHoldingSnapshot** (13F): new models when ingest exists; do not fake from headlines.
- Financial snapshots / **QuarterlyDelta:** store period, metric, prior, current, source — UNKNOWN never coerced to 0.

### Unchanged shared market tables
- Continue `DilutionInstrument`, `Catalyst`, `SymbolMaster`, coverage — extend indexes/types as needed.

---

## 5. Route changes

### Primary app IA (entitled users)
| Surface | Likely route / mode |
|---------|---------------------|
| Portfolio | `/dashboard` default mode `portfolio` |
| Watchtower | desk mode `watchtower` (What Changed across portfolio) |
| Research | mode `research` + `/ticker/[symbol]` company workspace |
| Discover | mode `discover` |

### Company workspace tabs (under ticker)
Overview · What Changed · Thesis · Financials · Capital · Insiders · Ownership · Filings · Timeline — implement as `/ticker/[symbol]?tab=` or nested routes; SSR gate: **public preview** may show limited Overview/Filings; full tabs require entitlement.

### Access gates
- `/dashboard`, `/desk`, protected APIs → **require entitled** (trial or paid), not free-tier shell.
- Anonymous → marketing / public ticker preview / login.
- Eligible for trial → checkout with trial; expired trial → paywall / pricing.
- Keep `/api/cron/*` fail-closed; public `/api/health` non-leaky.

### Pricing / checkout
- Single product page: Monthly $19.99 / Annual $149.99 (same features).
- Checkout body: `{ plan: "monthly" \| "annual" }` only (drop `tier`).
- Portal unchanged for manage/cancel.

### Guide
- Update `platform-guide.ts` + bump `PLATFORM_GUIDE_VERSION` when primary nav changes.

---

## 6. Entitlement migration strategy

**Target model:** one boolean (or enum) **product access**, server-side only.

```
entitled ⇔
  subscriptionStatus in { trialing, active }
  OR (subscriptionEndsAt > now())  // cancel-at-period-end grace
  OR explicit policy for past_due (recommend: entitled until endsAt if Stripe still open; else soft-lock with billing CTA)
```

**States to handle explicitly** (matrix tests required):

| State | Access |
|-------|--------|
| Anonymous | Public pages only |
| Auth, never trial, no sub | Eligible for 7-day trial via Checkout; **no** permanent free OS |
| Active trial (`trialing`) | Full access |
| Expired trial, no pay | No OS access |
| Active monthly / annual | Full access (identical) |
| Cancel-at-period-end, still `active` / endsAt future | Full access until end |
| Canceled / expired | No access |
| `past_due` / payment failure | Define once: prefer keep access through `subscriptionEndsAt` or short grace; never trust client; block duplicate checkout |
| Webhook delay after Checkout | SSR may show “activating” UI (`SubscriptionActivating`) — **not** grant via query string |
| Direct API / route without entitlement | 401/403 |

**Legacy Plus/Pro:**
- Any currently paid/trialing user remains **entitled** until period ends or cancel completes.
- Do **not** migrate their Stripe Price objects automatically.
- Stop writing Plus/Pro feature differences; `planTier` may remain for analytics/legacy display (`legacy_plus` / `legacy_pro`) but gating uses `hasProductAccess` only.
- New checkouts: only new monthly/annual price IDs.

**Trial non-restart:** keep `hasUsedTrial` + `TrialClaim` (email/phone hash). Never grant trial from client flags or route revisits.

---

## 7. Stripe migration strategy

1. Create **new** Stripe Prices: $19.99/mo and $149.99/yr (same Product preferred).
2. Env: e.g. `STRIPE_PRICE_ID` / `STRIPE_PRICE_ID_ANNUAL` repointed to new prices for **new** checkout; keep old Plus/Pro env vars readable only for **webhook classification of legacy subs** (map any known paid price → entitled).
3. Update `createCheckoutSession`: remove `tier`; set metadata `{ userId, plan }`; trial_period_days: 7 when allowed.
4. Webhook: set status/endsAt; mark entitled; stop requiring Plus/Pro feature fields; optionally store price id.
5. Add **event idempotency** (store processed `event.id`).
6. Portal: existing customers manage existing prices; no forced upgrade/downgrade job.
7. Display constants: `$19.99` / `$149.99` only for marketing/checkout UI.
8. Tests: no real charges; mock Stripe; matrix of webhook payloads including replay.

---

## 8. New domain architecture

```
Portfolio ──► symbols user monitors
     │
Watchtower ──► What Changed (portfolio-scoped event feed + significance)
     │
Research ──► company workspace (tabs) + source-grounded facts
     │
Discover ──► opportunity rules over public/structured events (not tips)

Cross-cutting:
  Entitlement (server)
  CompanyEventEngine (SEC + wires → typed events + evidence)
  ThesisEngine (user conditions → Thesis Health)
  CapitalRisk (dilution pipeline)
  FinancialDelta / QuarterlyDelta (structured facts, UNKNOWN-safe)
  Ownership (13D/13G/13F when ingested)
  Alerts / MonitoringRules / Portfolio Brief
```

### Principles
- Deterministic significance scoring for known event types (no LLM required for facts).
- Every claim carries source URL / accession / filing date when practical.
- Shelf registration ≠ dilution; Form 4 disposition ≠ open-market sale; 13F ≠ real-time.
- UNKNOWN/Unavailable never becomes `0`.
- Informational only — no buy/sell generation, no guaranteed returns, no price prediction AI.

### Ingest extensions (free SEC / structured)
- Add Atom/structured pulls for 13D/13G/13F when implementing Ownership — polite, bounded, idempotent.
- Filing section compare: hash sections between amendments; store diffs — no paid filing API.

---

## 9. Testing strategy

| Layer | Focus |
|-------|--------|
| Unit | `hasProductAccess` matrix (all states in §6); significance classifiers; dilution UNKNOWN; thesis condition eval; webhook handlers with fixtures |
| API | Negative auth: unentitled cannot hit protected routes; no client `userId`; cron without secret |
| Stripe | Checkout rejects second sub; trial claim blocks restart; signature failure 400; replay idempotent |
| Prisma | Migrations validate; generate; no destructive prod apply in CI without approval |
| Playwright | Login → trial/paywall; Portfolio/Watchtower/Research/Discover nav; ticker tabs; alert rule save; entitled vs denied |
| Regression | Existing dilution + subscription-guards expanded; monitor e2e remain optional if Monitor deep-linked |

Repo scripts: `npm run typecheck`, `lint`, `test`, targeted `test:*`, `test:e2e:*`, `build` / `verify` as applicable.

---

## 10. Security risks

| Risk | Mitigation |
|------|------------|
| Free-tier APIs left open after UI paywall | Convert all OS APIs to `requireEntitled`; audit `requireUser`-only routes that return private or live desks |
| Client-trusted `planTier` / query `subscribed` | Server session + DB only; query UX only |
| IDOR on thesis/rules/briefs | Always `userId: session.user.id` |
| Webhook forged events | Keep `constructEvent`; never skip signature |
| Webhook replay / userId spoof in metadata | Idempotency; bind customer id to known user; least-privilege updates |
| Secret leakage in ticker/public APIs | Public select lists only; no webhooks/phone |
| Cron open if `CRON_SECRET` missing | Fail closed outside local |
| Mass-assign subscription fields from settings | Allowlist PATCH fields (already a rule) |
| SMS cost abuse | Keep SMS optional + rate limits; never required |

---

## 11. Migration risks

| Risk | Mitigation |
|------|------------|
| Existing Plus users lose Markets/Structure mid-cycle | Single entitlement restores full access for all paid/trial |
| Existing Pro price customers charged new price | Never auto-change Stripe price |
| Env mis-point: new checkout uses old $49 price | Explicit new price IDs + tests on resolvePriceId |
| Dashboard free users locked out abruptly | Messaging + trial CTA; grandfather only if business asks (V2 says no permanent free OS) |
| Public ticker over-shares paid-only depth | Define preview vs full tab matrix |
| Dual gating (`planTier` + new helper) during rollout | One helper; deprecate Plus/Pro checks in same release train |
| Large Monitor/trader UI confusion | Deep-link or feature-flag; update Platform Guide |
| Incomplete What Changed while marketing ships | Ship entitlement + nav first; label Unavailable honestly |
| Prisma migration downtime | Additive migrations; expand-contract |

---

## 12. Step-by-step implementation order

1. **Docs & workflow** — this plan + checklist (done in planning prompt).
2. **Entitlement core** — `hasProductAccess` / `requireEntitled`; matrix tests; stop free OS dashboard without trial/paid.
3. **Stripe single SKU** — new prices, checkout/webhook/portal/pricing UI; legacy price → entitled mapping; no auto price migrate.
4. **API gate sweep** — replace `requirePro`/`requirePlus` feature splits with `requireEntitled` for OS APIs; keep public preview routes explicit.
5. **Nav IA** — Portfolio / Watchtower / Research / Discover; bump Platform Guide; paywall/trial empty states.
6. **Company workspace shell** — tabs with loading/empty/error; wire existing hub + dilution into Overview/Capital/Filings/Insiders (heuristic → structured over time).
7. **CompanyEvent / What Changed** — normalize SEC+wire events; significance; portfolio filter for Watchtower.
8. **Thesis + Thesis Health** — CRUD scoped to user; evaluation against events; alerts.
9. **Portfolio Brief** — personalized digest from Watchtower + thesis breaches.
10. **Capital Risk hardening** — dilution semantics already strong; surface in Capital + alerts.
11. **Financials / Quarterly Delta** — structured deltas, UNKNOWN-safe.
12. **Ownership** — 13D/13G then 13F (ingest + UI); never imply real-time.
13. **Filing redlines** — section compare for amendments.
14. **Discover rules** — opportunity monitoring without recommendations language.
15. **Deprecate freemium copy** — landing, pricing, guide, CHATGPT context if kept; optional hide trader deep-links.
16. **Hardening** — webhook idempotency, past_due policy, e2e access matrix, verify build.

Each numbered product prompt after this plan should implement **one checkpoint**, fully test, commit, and stop.

---

## 13. ADR — Prisma V2 foundation (2026-08)

**Status:** Accepted for expand-contract rollout.  
**Context:** Investor OS needs durable portfolio membership, typed company events, thesis/health, financial observations, capital-risk rollups, filing section diffs, structured insider/13F facts, per-user read state, and notification delivery beyond catalyst alerts — without duplicating `Catalyst`, `DilutionInstrument`, `AlertLog`, or inventing advice.

### Decision summary

| Concept | Decision | Why |
|---------|----------|-----|
| Portfolio membership | **New `PortfolioItem`** (user-owned). Keep `User.watchlist[]` during expand-contract; backfill via `syncPortfolioItemsFromWatchlist`. | `String[]` cannot store kind, shares, cost basis, archive, sort, or source; Watchtower joins need `(userId, symbol)` indexes. |
| Company events | **New shared `CompanyEvent`** with unique `fingerprint`. Optional `catalystId` / `dilutionInstrumentId` links. | `Catalyst` is a news/alert story (headline, judgment, `rawNewsId`). Watchtower needs typed category/eventType, before/after JSON, and idempotent SEC/derived events that are not 1:1 with wire stories. Extending Catalyst alone would overload two product meanings. |
| Financial metrics | **New shared `MetricObservation`**. | No prior table for period/metric/value/prior with UNKNOWN-as-null. Must not live on User. |
| Thesis | **New private `InvestmentThesis` + `ThesisCondition` + `ThesisEvaluation`**. | Conditions must be queryable and user-scoped; evaluations need evidence refs without generating buy/sell text. |
| Capital risk rollup | **New shared `CapitalRiskSnapshot`**. **Keep `DilutionInstrument`**. | Instruments remain the SEC-evidence source of truth; snapshots are point-in-time rollups for Capital / Watchtower UI. |
| Filing redlines | **New shared `FilingSectionSnapshot`**. | Persistence of section hash + optional diff is not modeled today; needed when redlines ship. |
| Insider | **New shared `InsiderTransaction`**. | Form 4 structure (codes, owner roles, prices) exceeds Catalyst headline heuristics. |
| Institutional | **New shared `InstitutionalHoldingSnapshot`**. | 13F period snapshots are not real-time; no existing model. 13D/13G material changes map to `CompanyEvent` (`ownership` category) with evidence JSON. |
| Event read/dismiss | **New private `UserCompanyEventState`**. | Shared events must not duplicate per user; read state is private. |
| Notification delivery | **New private `NotificationDelivery`**. **Keep `AlertLog`**. | `AlertLog` requires `catalystId` and cannot audit thesis / company-event / capital deliveries. |

### Non-goals / invariants

- No calculated investment advice columns.
- Shared company/market facts are never stored once-per-user.
- Private rows always include `userId` + `onDelete: Cascade` from User.
- Idempotency via unique fingerprints / natural keys; repeated ingest must upsert, not duplicate.
- Indexes support `symbol + time` and portfolio joins (`PortfolioItem.symbol` ↔ `CompanyEvent.symbol`).
- `User.watchlist` is not dropped in this migration; dual-read until settings dual-write lands.

### Consequences

- Ingest engines must validate `eventType` / categories against `src/lib/company-events/types.ts`.
- Settings/onboarding should eventually dual-write watchlist ↔ `PortfolioItem` (helper already provided).
- Alert paths for V2 subjects write `NotificationDelivery`; catalyst path may keep `AlertLog`.

---

## Appendix — High-signal file map

| Concern | Paths |
|---------|--------|
| Entitlements | `src/lib/subscription.ts`, `src/lib/api-guard.ts` |
| Stripe | `src/lib/stripe.ts`, `src/app/api/stripe/*` |
| Trial abuse | `src/lib/trial-claims.ts`, `TrialClaim` model |
| Desk IA | `src/lib/dashboard-shell/panel-prefs.ts`, `DashboardShellV3.tsx` |
| Dashboard SSR | `src/app/dashboard/page.tsx` |
| Dilution | `src/lib/dilution/*` |
| SEC | `src/lib/news-sources/sec-edgar.ts`, `src/lib/ingest/sources.ts` |
| Ticker | `src/lib/ticker-hub.ts`, `src/app/ticker/[symbol]/page.tsx` |
| Guide | `src/lib/platform-guide.ts` |
| Schema | `prisma/schema.prisma` |
| V2 portfolio sync | `src/lib/portfolio/sync-from-watchlist.ts` |
| Company event types | `src/lib/company-events/types.ts` |
| Company event engine | `src/lib/company-events/` · `docs/V2_COMPANY_EVENTS.md` |
| Thesis types | `src/lib/thesis/types.ts` |
