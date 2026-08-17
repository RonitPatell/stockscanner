# Prisma Operational Baseline

**Phase:** 3 — Local DB + Prisma operational baseline  
**Date:** 2026-08-17  
**Environment:** Windows dev · Neon PostgreSQL (`DATABASE_URL` from `.env`)

## Commands run

| Command | Result |
|---------|--------|
| `npx prisma validate` | **PASS** — schema valid |
| `npx prisma generate` | **FAIL (EPERM)** — Windows file lock on `query_engine-windows.dll.node` (no Next dev on :3000; likely AV/IDE lock) |
| `npx prisma db push --skip-generate` | **PASS** — "The database is already in sync with the Prisma schema." |

## Dev server

- No TrustTicker `next dev` listener on port 3000 at audit time.
- Prior terminal session showed a dev server that later exited (`status: failed`).

## Schema notes (certification-relevant models)

- `ResearchCheckpoint` — Phase 5 since-last researched (present in schema, DB synced)
- `CompanyDatasetState`, `CompanyHydrationJob` — readiness/hydration
- `MetricObservation`, `CompanyEvent`, `EvidenceRecord` — Company Reality OS read models
- `InvestmentThesis`, `ThesisCondition`, `ThesisEvaluation`, `ThesisRevision` — thesis

## Operator recovery (Windows EPERM on generate)

1. Close any running `npm run dev` for this repo.
2. Close processes holding `node_modules\.prisma\client\query_engine-windows.dll.node`.
3. Re-run: `npx prisma generate`
4. If still blocked: reboot or exclude project folder from realtime AV scan temporarily.

## Destructive actions

- **Not run:** `prisma migrate reset`, `--accept-data-loss`, production DB reset.

## Next certification step

Phase 4 — define real-data test universe; Phase 5+ — local hydration against public companies.
