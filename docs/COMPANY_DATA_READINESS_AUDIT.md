# Company data readiness audit

**Date:** 2026-08-17  
**Scope:** Diagnose why Research can show a valid US ticker while Financials / Capital / Insiders / Ownership / Filings are empty.  
**Status:** Diagnosis only. No hydration coordinator, identity service, or UI redesign in this change.

**Example ticker:** `RKLB` (Rocket Lab). It is in `ACTIVE_US_TICKERS` (curated core) and is a normal SEC-reporting issuer with CompanyFacts. Empty Research tabs for RKLB are therefore a **hydration / coverage / scheduling** problem, not “this issuer has no SEC identity.”

---

## Verdict

TrustTicker Research **does not live-fetch the SEC when a user opens a ticker**. Tabs are read models (`MetricObservation`, `DilutionInstrument`, `InsiderTransaction`, `BeneficialOwnershipFiling`, `FilingSectionSnapshot`, `InstitutionalHoldingSnapshot`, `CompanyEvent`, `Catalyst`). Those rows are filled by **ingest hooks + Vercel crons**.

Opening Research (`ResearchDesk`) only:

1. Normalizes the typed string client-side (`A–Z`, max 5).
2. Fetches existing DB-backed APIs (`/api/ticker/[symbol]/*`, `/api/research/[symbol]/overview`).
3. Stores recents in `localStorage`.

It does **not** resolve CIK, create `SymbolCoverage`, enqueue metrics, or backfill Form 4 / 13D / 10-Q sections.

So a ticker can be “visible in Research” while deeper data is unhydrated. The empty UI copy (`No … yet`) is the same for **not hydrated**, **job skipped (no CIK)**, **job failed**, and **source genuinely has nothing**.

Local `next dev` runs a **catalyst wire loop** only. It does **not** run `vercel.json` crons (`coverage`, `metrics`, `filings`, `institutional-13f`, `dilution` alerts). That is why local Financials/Capital/Insiders often look broken even when production architecture is correct.

---

## 1. How ticker → CIK resolution happens

There is **no** `resolveCompanyIdentity(symbol)` service.

| Path | What it does | Ticker → CIK? |
|------|----------------|---------------|
| `refreshSymbolMaster()` (`src/lib/coverage/symbol-master.ts`) | Fetches `https://www.sec.gov/files/company_tickers.json`, upserts `SymbolMaster.symbol` with `cik` padded to 10 digits | Yes (batch, daily cron) |
| `loadCikMap()` (`src/lib/news-sources/sec-edgar.ts`) | Same JSON, process-local **CIK → ticker** map for Atom titles | Reverse only (CIK → ticker) |
| `lookupCompanyMeta()` (`src/lib/portfolio/service.ts`) | `symbolMaster.findUnique` when adding to Portfolio | Read-only |
| Metrics cron | Portfolio `cik` **or** `SymbolMaster.cik` | Read-only; **skips** if both null |
| Catalyst hooks | Pass `cik` when present on the article; often null | Optional |

**Normalization today:**

- Research / ticker pages: `symbol.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5)`
- Coverage upsert: `/^[A-Z]{1,5}$/`
- Symbol master refresh: trim, upper, strip `.` (so `BRK.B` → `BRKB` if it survives `isValidTickerFormat`)
- CIK: `String(cik_str).padStart(10, "0")` in SymbolMaster; Atom titles parse `\((\d{6,10})\)` then pad

**RKLB path (happy):** SEC map row `{ ticker: "RKLB", cik_str: 1819994 }` → `SymbolMaster { symbol: "RKLB", cik: "0001819994" }` after `/api/cron/coverage`. Atom Form 4 titled `...(1819994)` maps to `RKLB` via `loadCikMap`.

**Gaps:**

- Two independent fetches of `company_tickers.json` (master refresh vs Atom mapper). No shared cache/service.
- No ticker→CIK lookup on Research open. If `SymbolMaster` is empty (fresh local DB, coverage cron never ran), **nothing** resolves CIK for RKLB even though the SEC file would.
- Curated-core fallback in `refreshSymbolMaster` inserts `ACTIVE_US_TICKERS` **with `cik: ""` → stored null** when the symbol is missing from the SEC file. Update uses `cik: row.cik \|\| undefined` so an empty refresh does not wipe a good CIK.
- **No alias table.** Ticker changes: new ticker gets the CIK on next master refresh; old ticker is soft-deactivated after 36h stale `refreshedAt`. Portfolio rows on the old symbol are not remapped.
- `isListedSymbol` can return true from `ACTIVE_US_TICKERS` **before** the first master refresh — listed ≠ CIK present.

**Do not fabricate CIKs.** Empty `cik` on curated rows is honest.

---

## 2. What causes a symbol to enter coverage

`SymbolCoverage` (`@@unique([symbol, reason])`) is the **poll / metrics universe**, not “user opened Research.”

Reasons (`src/lib/coverage/types.ts`): `USER_WATCHLIST`, `CURATED_CORE`, `ACTIVE_GAINER`, `UNUSUAL_VOLUME`, `RECENT_HALT`, `FRESH_SEC_FILING`, `FRESH_NEWS`, `MANUAL`. **There is no `RESEARCH` / `USER_SEARCH` reason.**

| Trigger | Reason | TTL |
|---------|--------|-----|
| `/api/cron/coverage` → `ensureCuratedCoreCoverage()` | `CURATED_CORE` for every `ACTIVE_US_TICKERS` (includes **RKLB**) | Permanent |
| Portfolio / settings watchlist sync | `USER_WATCHLIST` | Permanent |
| Scanner movers | `ACTIVE_GAINER` / `UNUSUAL_VOLUME` | 6–8h |
| Ingest (`catalyst-engine`) high-confidence news / SEC | `FRESH_NEWS` / `FRESH_SEC_FILING` | 12h / 48h |
| Halt-like headlines | `RECENT_HALT` | 24h |
| Operator | `MANUAL` | Permanent |

`getActiveCoverageSymbols()` unions DB coverage with the first 40 curated tickers. **Metrics cron does not call this helper.** It only walks:

- distinct non-archived `PortfolioItem.symbol` (up to 400)
- non-expired `SymbolCoverage.symbol` (up to 400)

So: RKLB is *eligible* for curated coverage, but **metrics will not see RKLB until a `SymbolCoverage` row or a portfolio row exists.** Searching Research never writes either.

---

## 3. Which jobs populate each read model

Shared ingest spine: SEC Atom (`fetchSecWireFilings`) → articles → catalysts → fire-and-forget hooks in `catalyst-engine.ts`:

- `processCatalystForDilution` → `DilutionInstrument` → `refreshCapitalRiskSnapshotForSymbol`
- `processCatalystForInsiders` → `InsiderTransaction` + `CompanyEvent`
- `processCatalystForOwnership` → `BeneficialOwnershipFiling`
- `processCatalystForFilingSections` → `FilingSectionSnapshot`

**CompanyFacts / Financials are not on that spine.** They only run in `/api/cron/metrics`.

| Dataset | Write path | Domain functions to reuse |
|---------|------------|---------------------------|
| Identity | `/api/cron/coverage` → `refreshSymbolMaster` | `symbol-master.ts` |
| Financials | `/api/cron/metrics` → `runMetricsCompanyfactsCron` → `fetchCompanyfacts` → `ingestCompanyfactsMetrics` | `metrics/companyfacts.ts`, `pipeline.ts`, `persist.ts` |
| Quarterly Delta | Pure read of `MetricObservation` | `getQuarterlyDeltaForSymbol` |
| Capital instruments | Ingest hook `dilution/from-catalyst` | `processFilingForDilution` |
| Capital risk snapshot | After dilution persist | `refreshCapitalRiskSnapshotForSymbol` / `evaluateCapitalRisk` |
| Filings redlines | Ingest hook + `/api/cron/filings` backfill of **recent catalysts** | `processCatalystForFilingSections` |
| Insiders | Ingest hook on Form 4 catalysts | `processForm4Filing` |
| 13D/13G | Ingest hook | `processOwnershipFiling` |
| 13F | `/api/cron/institutional-13f` on **13F-HR filer** catalysts | `process13fFiling` |
| What Changed | Read `CompanyEvent` (+ overlay) | `getCompanyWhatChangedFeed` |
| Watchtower | Same events | `watchtower/service.ts` |

**Critical shape:** Form 4 / 13D / 10-Q sections / dilution **require a Catalyst already in Postgres** from the **global current Atom firehose** (last N filings of that form type across *all* issuers). There is **no per-CIK submissions backfill** (`browse-edgar?action=getcompany&CIK=`). If RKLB has not appeared in the recent Atom window, Insiders/Ownership/Filings stay empty even with a perfect CIK.

Financials *can* hydrate without a recent filing because CompanyFacts is a per-CIK JSON document — **if** metrics cron includes the symbol and has a CIK.

---

## 4. Which jobs are Vercel cron-only

From `vercel.json` (UTC). Local `next dev` does **not** invoke these on a schedule.

| Route | Schedule | Role for Research depth |
|-------|----------|-------------------------|
| `/api/cron/coverage` | `5 11 * * *` | SymbolMaster + curated `SymbolCoverage` |
| `/api/cron/metrics` | `25 */4 * * *` | CompanyFacts → `MetricObservation` (limit 8 / tick) |
| `/api/cron/filings` | `50 */2 * * *` | 10-Q/10-K section backfill from **existing** catalysts |
| `/api/cron/institutional-13f` | `40 */2 * * *` | Parse recent 13F-HR catalysts |
| `/api/cron/dilution` | `*/15 * * * *` | **Alerts only** (does not extract instruments) |
| `/api/cron/wire` | `* * * * *` | SEC Atom + wires → catalysts + hooks |
| `/api/cron/ingest` | `*/2 * * * *` | Broader ingest |
| `/api/cron/thesis-health` | `15 */3 * * *` | Thesis eval (needs metrics already present) |

`authorizeCron` allows unauthenticated cron **only** in local `NODE_ENV=development` without Vercel/Railway. Production fail-closed without `CRON_SECRET`.

Checkpoints (`getJobCheckpoint`) are Redis + **process memory**. Serverless isolates lose memory cursors; without Redis, metrics cursor is lossy.

---

## 5. What runs automatically in local `next dev`

From `catalyst-engine.ts`: if `NODE_ENV !== "production"`, `startInstantIngestLoop()` runs wire burst + fast ingest on an interval.

**Does run locally (best-effort):** SEC Atom / news → Catalysts → dilution / Form 4 / 13D / filing-section hooks **when those forms appear in the current global Atom**. Also curated news polling for `ACTIVE_US_TICKERS` batches (Finnhub optional).

**Does not run locally unless you hit the route yourself:**

- `refreshSymbolMaster` / curated coverage
- CompanyFacts metrics
- Filings section cron backfill
- 13F cron
- Dilution **alert** dispatch
- Thesis health cron

There is **no** `npm run hydrate` (or equivalent) that shares production domain services.

Manual: `GET /api/cron/metrics` in local dev (cron auth relaxed) can populate Financials for symbols already in coverage/portfolio **with CIK**.

---

## 6. What happens if a symbol has never been monitored

**Research still opens.** Format gate only. No `SymbolMaster` required.

Then:

1. Overview / tabs query empty-or-sparse read models.
2. UI: “No structured financial observations… yet”, “No structured Form 4… yet”, etc.
3. Metrics cron never selects the symbol (not in portfolio, not in `SymbolCoverage`).
4. Insiders/filings/ownership only appear if the **global Atom** happened to include that issuer and ingest mapped the CIK→ticker.
5. Adding to Portfolio **does** `syncWatchlistCoverage` + copies `SymbolMaster` name/CIK onto the item — that is currently the main “I care about this name” signal. Research search is not.

**RKLB special case:** After production `/api/cron/coverage`, RKLB **is** monitored as `CURATED_CORE` even with zero users. Locally, if coverage cron never ran, RKLB is **not** in the metrics universe despite being in `ACTIVE_US_TICKERS`.

---

## 7. What happens if the ticker exists but CIK is missing

`SymbolMaster` row with `cik: null` (or coverage without a master row):

- Metrics: `skipped` (counts as skipped, job still `ok`).
- Atom ingest: filings for that CIK **drop on the floor** (`if (!symbol) continue` in `fetchSecAtomForm`).
- Portfolio can still store the symbol; `cik` on `PortfolioItem` stays null.
- Research UI unchanged — still looks like empty data, not “identity incomplete.”

---

## 8. What happens if CIK exists but metrics have never been fetched

`getQuarterlyDeltaForSymbol` loads up to 500 `MetricObservation` rows and builds a report with `empty: pool.length === 0`.

UI: `No structured financial observations for RKLB yet.`

No PROCESSING state. No last-attempt timestamp. Next chance is metrics cron: **8 symbols per 4 hours**, alphabetical cursor. A large coverage+portfolio universe can leave RKLB waiting many hours even in production.

`fetchCompanyfacts` returns `null` on permit failure, HTTP error, or bad JSON — treated like skip, not ERROR in UI.

Capital Risk **live-evaluates** on GET (`getCapitalRiskReportForSymbol`) from instruments + observations. Missing metrics → liquidity/shares unknown; the page is usually **not** a hard blank — status `unknown` with reason codes — unless the GET itself throws. Dilution timeline can still be empty.

---

## 9. What happens if a job fails

| Job | Isolation | User-visible |
|-----|-----------|--------------|
| Metrics per symbol | try/catch → `failed` count; others continue | Empty Financials; ops counter `metrics_normalize_fail` |
| CompanyFacts null | skipped | Same empty copy |
| Form 4 / ownership / dilution hooks | Non-throwing ingest hooks | Empty tabs |
| Filings cron | per-catalyst fail count | Empty Filings |
| 13F | checkpoint `retryAccessions` (max 24) | Empty 13F section |
| Coverage refresh | 500 JSON, generic error | Stale/empty master |
| Capital snapshot persist | throw logged; GET still live-evaluates | Possible unknown vs error placeholder |

No per-symbol `lastError` / `lastAttemptAt` on a readiness row. `Institutional13fFiling.errorNote` is the rare persisted error field (filer-centric, not issuer Research).

Retries: next cron tick / 13F retry list. No user retry that enqueues work (Research “Retry” only re-GETs the read API).

---

## 10. How freshness / staleness is represented

| Surface | Freshness today |
|---------|-----------------|
| Financials / Quarterly Delta | Implicit in observation `filedAt` / `periodEnd`. Report `asOf` is build time. No STALE flag. |
| Capital | Live evaluate; snapshot `asOf` + fingerprint (hourly). GET may show live status without a snapshot id. |
| Insiders / 13D | `filedAt` on rows; report `asOf` = now. Empty vs stale indistinguishable. |
| Filings | `filingDate` on snapshots. Cron only looks ~72–96h of **catalysts**. |
| 13F | `reportDate` (delayed by design). Copy in docs: not real-time. |
| What Changed | Window (`30d` etc.) + `usedFallbackWindow`. Empty message does not say “never ingested.” |
| SymbolMaster | `refreshedAt`; inactive if >36h since last full refresh. |
| Coverage | `expiresAt` on temporary reasons. |
| Job cursor | Redis checkpoint, not exposed to Research. |

There is **no** dataset-level `READY | STALE | MISSING | PROCESSING | UNSUPPORTED | ERROR`.

---

## 11. Where “not hydrated yet” looks like “genuinely unavailable”

These copies (and similar Overview lines) collapse four worlds into one:

| Copy | File | Collapsed meanings |
|------|------|--------------------|
| `No structured financial observations for {symbol} yet.` | `QuarterlyDeltaTable.tsx` | Never in metrics universe / no CIK / fetch null / unsupported XBRL / true empty |
| `No observations available yet.` | `QuarterlyDeltaCard.tsx` | Same |
| `No Capital Risk snapshot yet.` | `ResearchOverview.tsx` | Snapshot not persisted (GET still evaluates) vs no inputs |
| `No financing instruments extracted for this symbol yet.` | `CapitalTab.tsx` | No recent S-3/424B in Atom vs company has no programs |
| `No structured Form 4 transactions parsed for {symbol} yet.` | `InsidersTab.tsx` | No recent Form 4 in Atom vs no Form 4s vs parse miss |
| `No structured 13D/13G… yet` / `No Form 13F positions resolved… yet` | `OwnershipTab.tsx` | Firehose miss vs no 5% holders vs 13F name-match miss |
| `No section comparisons cached for {symbol} yet.` | `FilingsTab.tsx` | No recent 10-Q/10-K catalyst vs first filing vs hook truncated |
| `Nothing meaningful changed for {symbol} in this window.` | What Changed | No `CompanyEvent` rows vs all routine vs never ingested |
| `No recent Form 4 headlines mapped… in our feed.` | Public ticker overview | Wire cache vs identity miss |
| Overview `No structured Form 4 yet` / `No recent 13D/13G yet` / `No filing redlines yet` / `No comparable delta yet` | `ResearchOverview.tsx` | Same collapse |

Load **errors** (API 500) use `TickerPlaceholderTab` + Retry — that is distinct. **Empty successful reports are not.**

Public `/ticker/[symbol]` and entitled Research **read the same APIs** with no hydration side effect. Public pages should stay conservative; today they also do not distinguish “we have never tried.”

---

## Surface table

| Surface | Source | Population job | Requires CIK? | Trigger | Freshness mechanism | Current empty-state cause |
|---------|--------|----------------|---------------|---------|---------------------|---------------------------|
| Financials | `MetricObservation` via CompanyFacts | `/api/cron/metrics` → `ingestCompanyfactsMetrics` | **Yes** (skip otherwise) | Vercel every 4h, 8 symbols; **not** Research open; **not** local loop | Observation `filedAt`/`periodEnd`; no STALE | Not in coverage/portfolio; missing CIK; cron not run locally; cursor not reached; fetch null; sparse XBRL — all show “No structured financial observations… yet” |
| Quarterly Delta | Same observations, `buildQuarterlyDeltaReport` | Same as Financials (read-only) | Indirect (needs metrics) | Same | Per-row comparable flag; `unavailableReason` only when rows exist | `report.empty` uses identical “yet” copy; Financials tab **is** this table (no separate latest-quarter board) |
| Capital | `DilutionInstrument` + metrics → `evaluateCapitalRisk`; snapshot on dilution persist | Ingest hook `processCatalystForDilution`; snapshot `refreshCapitalRiskSnapshotForSymbol`; alerts-only `/api/cron/dilution` | Helpful for extract, not required to evaluate | Recent capital forms on **global Atom** + ingest | Snapshot fingerprint/hour; GET live-evaluates | Empty instruments + “yet”; Unknown status can still render — better than Financials — but Overview “No Capital Risk snapshot yet” overstates emptiness |
| Insiders | `InsiderTransaction` | Ingest `processCatalystForInsiders` / `processForm4Filing` | For Atom **mapping**; XML fetch uses accession URL | Form 4 in current Atom → catalyst | `filedAt` | No company-centric Form 4 history; “No structured Form 4… yet” |
| Ownership 13D/G | `BeneficialOwnershipFiling` | Ingest `processCatalystForOwnership` | Same as Insiders | SC 13D/G in current Atom | `filedAt` | Same firehose gap; unparseable stays unstructured event only |
| Institutional 13F | `InstitutionalHoldingSnapshot` + `Institutional13fFiling` | `/api/cron/institutional-13f` → `process13fFiling`; issuer ticker via `resolveHoldingSymbol` (name match on SymbolMaster) | Filer CIK from 13F; issuer CIK not required if name matches | 13F-HR catalysts last ~72–96h | `reportDate` (delayed) | Large files, name/CUSIP miss, cron not local; “No Form 13F positions resolved… yet” |
| Filings | `FilingSectionSnapshot` | Ingest hook + `/api/cron/filings` on recent 10-Q/10-K **catalysts** | For mapping; HTML fetch by accession | Recent periodic filings in Atom / 72–96h catalyst window | `filingDate`; skip if accession already snapshotted | No per-CIK 10-K/10-Q backfill; “No section comparisons cached… yet” |
| What Changed | `CompanyEvent` (+ financial delta cards if observations exist) | Event emitters on ingest/metrics/capital/insiders | Indirect | Those writers | Window + routine filter | “Nothing meaningful changed…” whether never ingested or truly quiet |

---

## RKLB end-to-end trace

```
User types "rklb" in ResearchDesk
  → openSymbol("RKLB")  // localStorage recents only
  → GET /api/research/RKLB/overview     // DB read models
  → GET /api/ticker/RKLB/quarterly-delta
  → GET /api/ticker/RKLB/capital-risk
  → GET /api/ticker/RKLB/insiders | ownership | filings | what-changed
  → no POST, no coverage upsert, no CompanyFacts fetch

Identity (if coverage cron has run in this DB):
  SymbolMaster.RKLB.cik = "0001819994"   // from company_tickers.json
  SymbolCoverage (RKLB, CURATED_CORE)

Identity (fresh local DB):
  SymbolMaster missing or cik null
  SymbolCoverage missing
  Metrics skip; Atom cannot map 1819994 → RKLB until loadCikMap succeeds in-process

Financials:
  Need: coverage/portfolio + CIK + /api/cron/metrics success
  CompanyFacts URL: https://data.sec.gov/api/xbrl/companyfacts/CIK0001819994.json
  Politeness: waitForSecPermit (≤8 rps aggregate)

Insiders / Ownership / Filings / Capital instruments:
  Need: RKLB filing in SEC getcurrent Atom → catalyst → hook
  Opening Research does not browse that CIK’s archive
```

---

## Duplicate ingestion logic (reuse, do not rewrite)

| Duplicate | Canonical to keep |
|-----------|-------------------|
| `company_tickers.json` in `symbol-master.ts` **and** `sec-edgar.ts` | One `loadSecCompanyTickers()` used by master refresh, Atom mapper, and future `resolveCompanyIdentity` |
| CIK pad (`padStart(10,"0")`) in master, Atom, `companyfacts.ts` | One `normalizeCik` |
| Symbol normalize (`toUpperCase` + strip non-letters) in Research, ticker-hub, coverage, APIs | One `normalizeSymbol` (respect `isValidTickerFormat`) |
| Metrics: cron vs any future Research fetch | **Must** call `ingestCompanyfactsMetrics` / `fetchCompanyfacts` — never a second normalizer |
| Form 4 / 13D / dilution / filings | Keep `processForm4Filing`, `processOwnershipFiling`, `processFilingForDilution`, `processCatalystForFilingSections` |
| Capital | Keep `evaluateCapitalRisk` + `refreshCapitalRiskSnapshotForSymbol` (GET already evaluates live) |
| 13F | Keep `process13fFiling`; issuer view is a **query**, not a second parser |
| Ticker hub Form 4 list vs Insiders tab | Hub = Catalyst headlines; Insiders = structured XML. Complementary, not duplicates — do not merge parsers |

**Missing reusable unit:** per-CIK EDGAR submissions fetch (company filing history) that **emits the same hook inputs** as Atom. Without it, on-demand hydration cannot fill Insiders/Filings except by waiting for the firehose.

---

## Local vs production mismatch (product)

| | Production (Vercel crons healthy) | Local `next dev` |
|--|-----------------------------------|------------------|
| RKLB in curated coverage | After daily coverage cron | Only if you ran `/api/cron/coverage` or added Portfolio |
| Financials | Eventually, if CIK + metrics cursor | Empty until you hit `/api/cron/metrics` |
| Form 4 / 13D / 10-Q sections | If issuer hit recent Atom | Same, plus local ingest loop helps **only** for current Atom |
| 13F | Incremental cron | Empty unless cron hit |

---

## Smallest architecture: “Search ticker → data-ready” without SEC on page render

Do **not** fetch CompanyFacts / Form 4 XML / 10-Q HTML inside React SSR or `GET /api/ticker/...`.

**One coordinator, two triggers, same domain services.**

1. **`resolveCompanyIdentity(symbol)`**  
   Normalize → `SymbolMaster` → if CIK missing, ticker lookup on shared `company_tickers` map → persist → `READY | NOT_FOUND | NO_CIK | ERROR`. No fabricated CIKs. No second identity table.

2. **`ensureCompanyReady(symbol, { intent })`**  
   Identity + `upsertCoverage` with a dedicated reason (e.g. `RESEARCH_INTEREST`, TTL, entitled-only). Inspect read-model existence/age. Enqueue missing datasets. Return readiness DTO for UI. Dedup via unique `(symbol, dataset)` job row or token.

3. **Hydration execution (Postgres queue + existing cron shape)**  
   - Table `CompanyHydrationJob` (or reuse checkpoint + unique constraint): `PENDING | RUNNING | SUCCEEDED | FAILED`, `lockedAt`, `attemptCount`, `lastError` (generic), `nextEligibleAt`.  
   - `/api/cron/hydrate` every minute (Vercel, `authorizeCron`, `maxDuration` ~60s, `mapPool` 1–2, SEC politeness).  
   - Worker for one symbol calls **existing** functions:  
     `fetchCompanyfacts` + `ingestCompanyfactsMetrics`  
     `refreshCapitalRiskSnapshotForSymbol`  
     per-CIK submissions (new thin client) → **same** Form 4 / ownership / dilution / filings persist  
     13F: lower priority / skip or separate job (size).  
   - Page GET only reads DB + readiness.

4. **Research interest (entitled)**  
   Opening/searching a valid company in the desk: `ensureCompanyReady` (rate-limited per user). **Not** required: Portfolio. **Not** on anonymous public `/ticker` crawls (or only if already covered / already cached).

5. **Local**  
   `npm run hydrate -- RKLB` = same `ensureCompanyReady` + drain/run jobs (not a second pipeline).

6. **UI**  
   Poll **readiness API** (DB), not SEC. States: READY / PREPARING / UNAVAILABLE / ERROR / STALE / LIMITED. Stop using a single “No … yet” for all of them.

**Out of scope for that smallest loop:** live quote, Finnhub, Redis (optional for checkpoints), 13F completeness, LLM.

**Honesty:** ETFs / some funds will be `NO_CIK` or CompanyFacts `UNSUPPORTED`. Banks/sparse XBRL may be `PARTIAL`. Unknown Capital is valid if reason codes explain why.

---

## Implementation notes (later prompts)

- Reuse `SymbolMaster` as canonical identity; do not add `CompanyIdentity`.
- Metrics universe must include Research-interested symbols (coverage reason), not only portfolio + today’s coverage table.
- Per-CIK archive fetch is the only new ingest client; parsers already exist.
- Bound work: one companyFacts doc, N recent accessions per form, SEC RPS, job lock, backoff.
- Public ticker pages: read cache only.
- Admin later: “Why is Financials empty for RKLB?” = identity + coverage + per-dataset timestamps/errors.

This audit is the baseline. Subsequent work should update this file if the architecture above changes.
