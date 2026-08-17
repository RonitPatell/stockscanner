# Beneficial ownership (Schedule 13D/13G)

Structured extracts when cover-page % / shares are reliably parseable.

Engine: `src/lib/ownership/` (`OWNERSHIP_ENGINE_VERSION`)

## Tracked fields

- Filer / reporting person
- Issuer
- Reported ownership %
- Shares beneficially owned
- Filing type + initial vs amendment
- Filing date + accession
- Previous reported % when same filer is comparable

## CompanyEvents (Watchtower)

| Kind | Event type |
|------|------------|
| New material holder (≥5%, no prior) | `beneficial_ownership_material_new` |
| Meaningful % change (≥1 pp) | `beneficial_ownership_pct_change` |
| Exit / reduction | `beneficial_ownership_exit` |

Unparseable filings stay as generic `sec_13d` / `sec_13g` form events — **no invented %**.

## Copy

`Beneficial owner reported X%` — never “smart money is buying.”

## UI

Ticker **Ownership** tab · `GET /api/ticker/[symbol]/ownership`

## Tests

`tests/ownership-13d.test.mts` + `tests/fixtures/schedule-13d.ts`
