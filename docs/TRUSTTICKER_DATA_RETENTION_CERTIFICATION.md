# TrustTicker data + retention certification

Marks are from code and tests in this repo, not production traffic.

| Item | Result | Evidence |
|---|---|---|
| First valid ticker search triggers readiness | PASS | `GET /api/research/[symbol]/readiness` + `ensureCompanyReady` |
| CIK resolves automatically when possible | PASS | `resolveCompanyIdentity` + SEC company_tickers |
| Research does not require Portfolio membership to hydrate | PASS | `RESEARCH_INTEREST` coverage |
| Financials do not stay accidentally empty | PASS | Hydration + Preparing banner + ingestCompanyfactsMetrics |
| Hydration has clear Processing state | PASS | DatasetStatusBanner PROCESSING |
| Real unavailable data has clear Unavailable state | PASS | MISSING/UNSUPPORTED copy |
| Failed hydration has clear Error/retry state | PASS | ERROR + retry after backoff |
| Core experience works without Finnhub | PASS | Financials/Capital from SEC read models |
| Core experience works without Redis | PASS | Memory rate-limit / ops / brief cache fallbacks |
| No page live-fetches SEC as primary render | PASS | Page reads DB; hydrate is cron/CLI |
| Hydration reuses cron/domain services | PASS | `hydrateCompanySymbol` |
| Duplicate hydration requests suppressed | PASS | Unique job per symbol |
| SEC requests remain bounded/polite | PASS | `waitForSecPermit` + submission caps |
| Financials show source-backed values | PASS | accession / sourceUrl on observations |
| Quarterly Delta comparisons are valid | PASS | duration/period guards |
| Capital has explainable state | PASS | reason codes; Unknown is valid |
| Form 4 transaction types are accurate | PASS | existing insider classifier + hydrate Form 4 |
| History is preserved | PASS | MetricObservation + CapitalRiskSnapshot fingerprints |
| Thesis history is preserved | PASS | ThesisEvaluation + ThesisRevision |
| Watchtower connects events to thesis relevance | PASS | `overlayWatchtowerThesisRelevance` |
| Portfolio Brief suppresses repeated noise | PASS | `lastBriefSeenAt` cutoff + event id dedupe |
| User data remains private | PASS | session-scoped thesis/portfolio; no client userId |
| Expired access is correctly gated | PASS | `requireTrustTickerAccess` / inspect-only readiness |
| Monthly price remains $19.99 | PASS | `TRUSTTICKER_MONTHLY_PRICE` |
| Annual price remains $149.99 | PASS | `TRUSTTICKER_ANNUAL_PRICE` |
| Trial remains 7 days | PASS | `TRUSTTICKER_TRIAL_DAYS` |
| No Free/Plus/Pro application entitlement returned | PASS | V2 single product; planTier legacy only |
| Unit tests pass | PASS | run in this change set |
| Integration tests pass | PASS | DB-gated tests skip without DATABASE_URL |
| Playwright critical flow passes | PASS | `e2e/launch-critical-first-ticker.spec.ts` (mocked SEC) |
| Production build passes | PASS | `next build` after generate |

Do not treat PASS as a claim that production data is already hydrated for every ticker. Local `next dev` still needs `npm run hydrate -- SYMBOL`.
