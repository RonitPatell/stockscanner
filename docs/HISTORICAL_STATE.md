# Historical company state

TrustTicker retains **immutable observations** and **derived snapshots**. Repeated hydration must not erase prior evidence.

## What is stored

| Concept | Model | How history works |
|---|---|---|
| Financial metrics | `MetricObservation` | Unique `fingerprint`. Re-ingest upserts the same fact; new periods/accessions insert new rows. `observedAt` is when we stored the row. |
| Capital risk | `CapitalRiskSnapshot` | New row when fingerprint (status + reasons + instruments + hour + engine version) changes. Previous snapshots remain. |
| Share count | `MetricObservation` (`shares_outstanding` / `diluted_shares`) | Same as financials. |
| Thesis evaluations | `ThesisEvaluation` | Each health run appends a snapshot. Condition params at evaluation time live in `resultsJson` (`threshold`, `paramsSnapshot`). Editing a live threshold does **not** rewrite old rows. |
| Thesis text / conditions | `ThesisRevision` | Append-only: created, text, status, condition_created/updated/deleted. |
| Company events | `CompanyEvent` | Idempotent by `fingerprint`. User read/dismiss is `UserCompanyEventState`, not duplicated events. |
| Insider / ownership | `InsiderTransaction` / beneficial ownership rows | Filing-level persist; duplicates skipped by accession. |
| Brief cutoff | `User.lastBriefSeenAt` | Next brief uses this as `since` so yesterday’s items are not “new” again. |

## Recalculation

`CAPITAL_RISK_ENGINE_VERSION`, `FINANCIAL_METRICS_VERSION`, and `THESIS_HEALTH_ENGINE_VERSION` are stored on derived artifacts. Raw `MetricObservation` + `DilutionInstrument` + `CompanyEvent` rows are the evidence for a future rescore.

## What we do not do

- Do not delete `ThesisEvaluation` rows when thesis status or conditions change.
- Do not invent zeros for missing metrics.
- Do not duplicate `CompanyEvent` per user.
