# Financial metric layer

Normalized SEC companyfacts → `MetricObservation` for **change monitoring** and **thesis evaluation**.

This is **not** a fundamentals terminal.

Engine version: `FINANCIAL_METRICS_VERSION` (`1.0.0`)  
Code: `src/lib/metrics/`

## Metrics

| Key | Source |
|-----|--------|
| `revenue` | us-gaap aliases (canonical + `SalesRevenueNet`, `Revenues`, …) |
| `gross_profit` | `GrossProfit` |
| `gross_margin` | **derived** `gross_profit / revenue * 100` |
| `operating_income` | `OperatingIncomeLoss` |
| `operating_margin` | **derived** when revenue &gt; 0 |
| `net_income` | `NetIncomeLoss` / `ProfitLoss` |
| `operating_cash_flow` | operating activities cash flow concepts |
| `capital_expenditures` | PPE / productive asset payments (positive outflow) |
| `free_cash_flow` | **derived** `OCF - abs(CapEx)` when both reliable |
| `cash` | cash & equivalents (instant) |
| `total_debt` | long-term / current debt concepts (best-effort; incomplete capital structure) |
| `diluted_shares` | weighted average diluted shares |
| `shares_outstanding` | DEI / common shares outstanding (instant) |
| `eps_diluted` | `EarningsPerShareDiluted` |

Margins are stored as **percent points** (30 = 30%).

## Stored fields

Each observation retains:

- period start / end, fiscal year / period (`FY`\|`Q1`…`Q4`)
- filed date, accession, SEC concept
- value, unit, currency
- confidence, fingerprint
- `evidenceJson` (alias index, duration days, **source fingerprints for derived metrics**)

## Rules

1. Prefer canonical us-gaap concepts; fall back through an ordered alias list.
2. Prefer 10-K / 10-Q over 8-K when scoring points for the same period.
3. **Never** silently combine incompatible periods (duration bucket + fiscal period checks).
4. Missing / incomparable → `null` / `comparable: false` (**UNKNOWN**), never `0`.
5. Derived metrics always keep source observation metadata in `evidence`.
6. Dedupe via content-addressed `fingerprint`.

## Calculations

- YoY / QoQ absolute + percent change
- Margin **bps** change (`Δpercent_points * 100`)
- Share-count change (YoY or QoQ)

## Limitations (honest)

- Issuer-specific extension taxonomies are **not** fully mapped — only curated aliases.
- `total_debt` is **not** a complete capital-structure rollup (may miss leases, convertibles, etc.).
- Instant vs duration mixing for arbitrary custom ratios is rejected.
- YTD cumulative facts vs discrete quarter facts are not auto-reconciled; we prefer points with both `start`+`end` and fiscal period labels.
- Live `data.sec.gov` fetch is polite and may return `null` under rate limits — fixtures drive correctness tests.
- Cash runway quarters are **not** produced here (needs expense / burn model — thesis key remains separate).
- Thesis key `eps` maps conceptually to `eps_diluted` at evaluation time (health engine later).

## Tests

`tests/metrics-layer.test.mts` + fixtures in `tests/fixtures/companyfacts.ts`
(tech / legacy revenue alias / sparse styles).
