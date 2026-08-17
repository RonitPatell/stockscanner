# Thesis Monitoring + Health

Private, user-scoped investment thesis per monitored symbol.

> Conditions are evaluative framing only — **not** buy/sell advice.  
> `CUSTOM_MANUAL` is never auto-evaluated.  
> Thesis Health returns **PASS / WARN / FAIL / UNKNOWN** counts — never a single deceptive “stock score”.

## Models

- `InvestmentThesis` — unique `(userId, symbol)`
- `ThesisCondition` — typed `conditionType` + validated `paramsJson`
- `ThesisEvaluation` — persisted health snapshots (`score` always `null`)

## Condition types

| Type | Params | Example |
|------|--------|---------|
| `METRIC_ABOVE` / `METRIC_BELOW` | `metricKey`, `threshold` | Gross margin above 30 |
| `METRIC_GROWTH_ABOVE` / `METRIC_GROWTH_BELOW` | `metricKey`, `thresholdPercent`, `period?` | Revenue YoY growth above 25% |
| `NO_EVENT_TYPE` / `EVENT_TYPE_OCCURRED` | `eventType` | No `sec_s3` after thesis start |
| `SHARE_COUNT_CHANGE_BELOW` | `thresholdPercent`, `period?` | Share count growth below 10% YoY |
| `CAPITAL_RISK_NOT_ABOVE` | `maxStatus` | Never above `moderate` |
| `CASH_RUNWAY_ABOVE` | `quarters` | Unknown until burn model exists |
| `CUSTOM_MANUAL` | `text` | Qualitative — not auto-verified |

## Thesis Health

Engine: `src/lib/thesis/health/` (`THESIS_HEALTH_ENGINE_VERSION`)

Each automated condition result includes:

- state (`PASS` \| `WARN` \| `FAIL` \| `UNKNOWN`)
- factual explanation
- observation date
- actual value / threshold when numeric
- evidence/source reference
- evaluation timestamp

### Explicit `NO_EVENT_TYPE` rule (S-3 / shelf)

When a matching event occurs **after thesis start**:

- Capital registration types (`sec_s3`, `sec_s3_a`, `shelf_registration`, …):
  - `invalidate_if` / `risk_if` → **FAIL**
  - `support_if` → **WARN**
- Other event types → **FAIL**

### Summary

```
N passing · N warning · N failed · N unknown
(+ manual count, excluded from automated totals)
```

Rollup labels on the thesis: `healthy` | `watch` | `broken` | `unknown` — **not** a return forecast.

### Re-evaluation triggers (async, debounced)

- Condition add / edit / delete
- New `CompanyEvent` for the symbol
- New `MetricObservation` for the symbol
- `CapitalRiskSnapshot` status change
- Cron catch-up for stale active theses
- Manual `POST /api/thesis/[id]/health`

UI/API reads return the **latest persisted** evaluation — they do not run full evaluation synchronously.

## Endpoints

All require `requireTrustTickerAccess`. **Never** accept client `userId`.

| Method | Path |
|--------|------|
| `GET` | `/api/thesis` |
| `POST` | `/api/thesis` |
| `GET`/`PATCH`/`DELETE` | `/api/thesis/[id]` |
| `POST` | `/api/thesis/[id]/conditions` |
| `PATCH`/`DELETE` | `/api/thesis/[id]/conditions/[conditionId]` |
| `PUT` | `/api/thesis/[id]/conditions/reorder` |
| `GET`/`POST` | `/api/thesis/[id]/health` |
| cron | `/api/cron/thesis-health` |

## Code

- `src/lib/thesis/` — CRUD + types
- `src/lib/thesis/health/` — evaluate / persist / schedule
- `src/lib/capital-risk/snapshot.ts` — CapitalRiskSnapshot rollup
- Tests: `tests/thesis-monitoring.test.mts`, `tests/thesis-health.test.mts`
