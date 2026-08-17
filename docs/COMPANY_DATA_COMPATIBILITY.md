# Company data compatibility

Sanitized CompanyFacts-shaped fixtures in `tests/fixtures/companyfacts-universe.ts`. No live SEC calls.

Grades:

- **PASS** — core metrics extract (revenue plus margin and/or income, or a complete growth set).
- **PARTIAL** — some usable facts; others unsupported for this taxonomy.
- **UNSUPPORTED** — TrustTicker will not invent the metric.

| Sample | Identity | Financials | Capital | Insiders | Filings |
|---|---|---|---|---|---|
| Mega-cap technology | PASS | PASS | PARTIAL (facts only; financing from dilution pipeline) | PARTIAL (Form 4 hydrate, not in this fixture) | PARTIAL |
| Bank / financial | PASS | PARTIAL (net income + cash; interest income is **not** mapped to revenue) | PARTIAL | PARTIAL | PARTIAL |
| SaaS | PASS | PASS | PARTIAL | PARTIAL | PARTIAL |
| Industrial / manufacturing | PASS | PASS (`SalesRevenueGoodsNet`) | PARTIAL | PARTIAL | PARTIAL |
| Biotech | PASS | PARTIAL (revenue + cash + burn; often no gross profit) | PARTIAL | PARTIAL | PARTIAL |
| Pre-profit growth (RKLB-like) | PASS | PASS | PARTIAL / Unknown runway is valid | PARTIAL | PARTIAL |
| Small-cap issuer | PASS | PARTIAL | PARTIAL (financing detected in dilution instruments, not XBRL) | PARTIAL | PARTIAL |
| Non-calendar fiscal year | PASS | PARTIAL (revenue YoY on matching fiscalPeriod) | PARTIAL | PARTIAL | PARTIAL |
| Amended filing | PASS | PARTIAL (later 10-Q/A wins same period) | PARTIAL | PARTIAL | PARTIAL |
| Sparse / nonstandard XBRL | PASS | PARTIAL / UNSUPPORTED per metric | PARTIAL (Unknown with reason codes) | PARTIAL | PARTIAL |

## Limitations (intentional)

- Bank **interest income** is not treated as `revenue`.
- Operating margin is skipped when revenue ≤ 0.
- UNKNOWN stays null — never coerced to zero.
- 13F is not part of on-demand hydration.
- Form 4 / 13D / section text require filing persist, not CompanyFacts.
