# Thesis Monitoring (backend)

Private, user-scoped investment thesis per monitored symbol.

> Conditions are evaluative framing only — **not** buy/sell advice.  
> `CUSTOM_MANUAL` is never auto-evaluated. Automated types stay `UNKNOWN` until Thesis Health runs.

## Models

- `InvestmentThesis` — unique `(userId, symbol)`
- `ThesisCondition` — typed `conditionType` + validated `paramsJson`
- `ThesisEvaluation` — reserved for health snapshots (not written by this CRUD checkpoint)

## Condition types

| Type | Params | Example |
|------|--------|---------|
| `METRIC_ABOVE` / `METRIC_BELOW` | `metricKey`, `threshold` | Gross margin above 30 |
| `METRIC_GROWTH_ABOVE` / `METRIC_GROWTH_BELOW` | `metricKey`, `thresholdPercent`, `period?` | Revenue YoY growth above 25% |
| `NO_EVENT_TYPE` / `EVENT_TYPE_OCCURRED` | `eventType` | No `atm_program` |
| `SHARE_COUNT_CHANGE_BELOW` | `thresholdPercent`, `period?` | Share count growth below 10% YoY |
| `CAPITAL_RISK_NOT_ABOVE` | `maxStatus` | Never above `moderate` (elevated fails) |
| `CASH_RUNWAY_ABOVE` | `quarters` | Cash runway above 4 quarters |
| `CUSTOM_MANUAL` | `text` | Qualitative — not auto-verified |

No arbitrary executable formulas.

## Evaluation DTO

- Automated → `{ mode: "automated", state: "UNKNOWN" }` until health engine
- Manual → `{ mode: "manual", state: null }`

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

## Code

- `src/lib/thesis/` — types, schemas, service
- Tests: `tests/thesis-monitoring.test.mts`
