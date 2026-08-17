# Evidence model

TrustTicker's **Evidence Graph** connects user-facing claims to primary-source records without duplicating immutable SEC facts or filing bodies.

## Design principles

1. **Reference, don't duplicate** — `MetricObservation`, `InsiderTransaction`, `CompanyEvent`, and `FilingSectionSnapshot` remain authoritative. `EvidenceRecord` indexes and links them.
2. **Idempotent ingestion** — unique `fingerprint` per evidence row; safe retries.
3. **Availability states** — `verified | derived | reported | unknown` (not buy/sell ratings).
4. **UNKNOWN stays null** — evidence refs for missing values use `availability: unknown`; never coerce to zero in payloads.
5. **No page-render fetch** — evidence sync runs from hydration/cron/adapters, not React.

## Persistence

Model: `EvidenceRecord` (Prisma)

| Field | Purpose |
|-------|---------|
| `symbol`, `cik` | Company scope |
| `category` | Evidence kind (see below) |
| `sourceType`, `sourceId`, `sourceUrl` | Provenance |
| `occurredAt`, `reportedAt`, `periodStart`, `periodEnd` | Time semantics |
| `linkedModel`, `linkedId` | Pointer to existing row |
| `payloadJson` | Bounded metadata only |
| `availability` | Verified / Derived / Reported / Unknown |
| `fingerprint` | Dedupe key |

Indexes: `(symbol, occurredAt)`, `(symbol, category)`, `(linkedModel, linkedId)`.

## Categories

| Category | Typical linked model |
|----------|---------------------|
| `sec_xbrl_fact` | `metric_observation` |
| `form4` | `insider_transaction` |
| `ownership_13d` | `beneficial_ownership_filing` |
| `ownership_13f` | `institutional_holding_snapshot` |
| `capital_financing` | `dilution_instrument` |
| `capital_snapshot` | `capital_risk_snapshot` |
| `filing_section` | `filing_section_snapshot` |
| `company_event` | `company_event` |
| `external_government` | `external_payload` (Phase 10+) |
| `external_clinical` | `external_payload` (Phase 11+) |

## Code

| Module | Role |
|--------|------|
| `src/lib/evidence/types.ts` | Categories, DTOs |
| `src/lib/evidence/fingerprint.ts` | Dedupe |
| `src/lib/evidence/persist.ts` | Upsert + list |
| `src/lib/evidence/from-metric.ts` | MetricObservation → ref |
| `src/lib/evidence/from-company-event.ts` | CompanyEvent → ref |
| `src/lib/evidence/sync.ts` | Batch sync for symbol |

## Sync workflow

```
hydrate / cron / adapter
  → persist domain row (MetricObservation, CompanyEvent, …)
  → optional: syncEvidenceForSymbol(symbol)
  → EvidenceRecord upsert (linkedModel + linkedId)
  → Company State / What Changed / EvidenceCard read refs
```

## Security

- Evidence rows are **shared product data** (symbol-scoped), not user-private.
- External payloads must pass URL validation before storage.
- Never store secrets, thesis text, or full document dumps in `payloadJson` when a linked row exists.

See also: `docs/COMPANY_REALITY_OS_ARCHITECTURE.md`.
