# Identity / CIK Certification

**Phase:** 5  
**Date:** 2026-08-21  
**Universe:** `docs/REAL_DATA_TEST_UNIVERSE.md`

## Results

| Check | Result |
|-------|--------|
| Unit: `tests/company-identity.test.mts` | PASS (14) |
| Unit: `tests/identity-universe.test.mts` | PASS (fixture SEC map for all 12 universe tickers) |
| Local hydrate RKLB | PASS — Identity ready, CIK `0001819994` |

## Guarantees covered by tests

- Lowercase / whitespace normalize to canonical ticker
- Invalid / unknown → `NOT_FOUND` (no invented CIK)
- Repeated + concurrent resolve → same CIK, no duplicate identity rows
- `BRK.B` / `BRK-B` normalize to `BRKB` for SEC mapping

## Live SEC note

Fixture tests prove resolver logic. Live `company_tickers.json` is exercised by `npm run hydrate -- SYMBOL` (polite, local-only). Do not gate CI on live SEC.

## Defects fixed in this program so far

- Capital risk snapshot fingerprint race during hydrate (`P2002` → idempotent)
