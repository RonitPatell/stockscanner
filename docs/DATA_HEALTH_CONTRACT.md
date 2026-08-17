# TrustTicker — Data Health Contract

**Phase:** 1 — Platform data-health vocabulary  
**Date:** 2026-08-17  
**Owner:** Company readiness (`src/lib/company-readiness/*`)

This document defines the **single shared vocabulary** for user-facing company dataset health. UI, APIs, and hydration must use these terms — not ad hoc "no data yet" copy.

---

## Datasets

| ID | Hydration | Notes |
|----|-----------|-------|
| `IDENTITY` | On identity resolve | SymbolMaster + CIK |
| `FINANCIALS` | On-demand hydrate + `/api/cron/metrics` | MetricObservation |
| `CAPITAL` | On-demand hydrate + dilution cron | DilutionInstrument + CapitalRiskSnapshot |
| `INSIDERS` | On-demand hydrate | Form 4 → InsiderTransaction |
| `OWNERSHIP` | On-demand hydrate | 13D/G → BeneficialOwnershipFiling |
| `INSTITUTIONAL_13F` | **Cron only** | InstitutionalHoldingSnapshot |
| `FILINGS` | On-demand hydrate + filings cron | FilingSectionSnapshot |
| `COMPANY_EVENTS` | Derived from hydrate + ingest | CompanyEvent count |
| `COMPANY_STATE` | Derived read model | Requires FINANCIALS observations |

`OWNERSHIP` covers beneficial ownership (13D/G). 13F is separate and delayed.

---

## Status values

| Status | Meaning |
|--------|---------|
| `READY` | Dataset is usable now (may have zero qualifying rows — see reason code) |
| `PROCESSING` | Hydration or refresh in progress |
| `STALE` | Stored data exists but exceeds documented freshness TTL |
| `MISSING` | **Not hydrated yet** or never successfully checked |
| `UNSUPPORTED` | Source/architecture cannot support this company or metric |
| `ERROR` | Attempted population and failed |

**Critical:** `MISSING` means *not hydrated / not checked yet*. It must **not** mean "we checked SEC and found nothing." That case uses `READY` + `READY_EMPTY_CONFIRMED` or `NO_QUALIFYING_RECORDS`.

---

## Reason codes (server-facing, safe summaries for UI)

| Code | When | UI hint |
|------|------|---------|
| `NOT_HYDRATED` | No successful attempt; job not run | "Preparing …" / enqueue |
| `NO_CIK` | Identity has no resolvable CIK | "SEC identity unavailable" |
| `NO_SYMBOL` | Ticker not found in SEC mapping | "Unknown ticker" |
| `SOURCE_UNSUPPORTED` | CompanyFacts / dataset unsupported | Explain limitation |
| `NO_QUALIFYING_RECORDS` | Checked indexed window; zero qualifying rows | Factual empty (Form 4, 13D/G, etc.) |
| `PARSER_FAILURE` | Parse/extract failed | Error + retry |
| `UPSTREAM_FAILURE` | SEC/network/submissions failed | Error + retry |
| `STALE_DATA` | Rows exist but past TTL | Show date + refresh |
| `PROCESSING` | Job pending/running | Bounded poll readiness |
| `READY` | Rows present and fresh | Render data |
| `READY_EMPTY_CONFIRMED` | Hydration succeeded; zero rows is valid | Confirmed empty copy |

Reason codes are resolved in `src/lib/company-readiness/data-health.ts`.

---

## DataHealthResult fields (API-safe)

```typescript
{
  dataset: CompanyDataset;
  status: DatasetStatus;
  reasonCode: DataHealthReasonCode;
  reasonSummary: string;      // sanitized, no secrets
  retryEligible: boolean;
  sourceChecked: boolean;     // true when an attempt indexed the source
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  dataAsOf: string | null;
  rowCount: number | null;
}
```

Do **not** expose: lock tokens, raw stack traces, internal hostnames, full submission URLs with secrets.

---

## Semantics: `sourceChecked`

| sourceChecked | User should understand |
|---------------|------------------------|
| `false` | TrustTicker has not finished checking this dataset |
| `true` | TrustTicker ran hydration or inspect against persisted rows |

---

## Integration points

| Consumer | Usage |
|----------|-------|
| `GET /api/research/[symbol]/readiness` | Returns `readiness.datasets[*].health` |
| `DatasetStatusBanner` | Uses `reasonCode` + `reasonSummary` (Phase 2) |
| `npm run hydrate` | Should print health summary (Phase 35) |
| Tests | `tests/data-health-contract.test.mts` |

---

## Do not duplicate

Use `CompanyDatasetState`, `CompanyHydrationJob`, and `ensureCompanyReady`. Do not add parallel readiness tables or client-side SEC fetch for health.
