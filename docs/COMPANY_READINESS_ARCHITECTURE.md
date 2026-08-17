# Company readiness architecture

TrustTicker Research must not live-fetch the SEC during page render. Identity, coverage, and dataset hydration share the **same domain services** as cron.

## Flow

```
Entitled Research open (RKLB)
  → GET /api/research/RKLB/readiness
  → resolveCompanyIdentity (SymbolMaster + company_tickers)
  → upsertCoverage(RESEARCH_INTEREST, 7d TTL)
  → inspect MetricObservation / DilutionInstrument / Form 4 / 13D / FilingSection
  → enqueue CompanyHydrationJob (unique per symbol)
  → return existing DB read models + dataset statuses
  → UI polls readiness (≤8 times); does not call SEC

/api/cron/hydrate (every 2m) or `npm run hydrate -- RKLB`
  → lock job
  → fetchCompanyfacts + ingestCompanyfactsMetrics
  → submissions JSON → processForm4Filing / processOwnershipFiling /
    processFilingSections / processFilingForDilution
  → refreshCapitalRiskSnapshotForSymbol
  → persist CompanyDatasetState timestamps
```

Public `/ticker/[symbol]` and expired sessions: inspect only, **no enqueue**.

## Statuses

`READY | STALE | MISSING | PROCESSING | UNSUPPORTED | ERROR`

- **PROCESSING** — job pending/running; UI: “Preparing …”
- **UNSUPPORTED** — no CIK, or CompanyFacts with no usable metrics
- **MISSING** — we looked (or have not); nothing in the read model
- **ERROR** — attempt failed; retry after `nextEligibleAt`
- **STALE** — rows exist but older than dataset TTL

13F is **not** part of on-demand hydrate (size). `/api/cron/institutional-13f` remains the writer.

## Dedup / politeness

- One `CompanyHydrationJob` row per symbol
- Dataset `nextEligibleAt` + job backoff (15m … 12h)
- SEC `waitForSecPermit`
- Bounded submissions: 8 Form 4, 4 10-Q/10-K, 4 13D/G, 6 capital forms
- Accession-level skip in existing persist functions

## Local

```bash
npm run dev
npm run hydrate -- RKLB
npm run hydrate:portfolio
```

Same `hydrateCompanySymbol` as cron. Dev POST `/api/dev/hydrate` fail-closed outside local next-dev unless `ADMIN_EMAILS`.
