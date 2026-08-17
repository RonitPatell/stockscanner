# Insider intelligence (Form 4)

Structured Form 4 ownership XML → `InsiderTransaction` + Watchtower events.

Engine: `src/lib/insider/` (`INSIDER_ENGINE_VERSION`)

## Classification

| Code | Classification |
|------|----------------|
| P | open_market_purchase |
| S | open_market_sale |
| A | grant_award |
| M / X / C | option_exercise |
| G | gift |
| F | tax_withholding |
| other | other |

**A/D (acquiredDisposed) is not a sale signal.** Tax withholding and issuer dispositions are not labeled open-market sales.

## Summaries

Factual only, e.g. `CEO sold 25,000 shares at a reported transaction price of $12.50.`  
Never predictive alpha.

## Clusters

≥2 open-market purchases or sales within 7 days → informational `insider_cluster_*` events.

## Ingest

`processCatalystForInsiders` from `catalyst-engine` (alongside dilution + company events). Fetches primary Form 4 XML via polite SEC access when Atom fires.

## UI

Ticker hub **Insiders** tab · `GET /api/ticker/[symbol]/insiders`

## Tests

`tests/insider-form4.test.mts` + `tests/fixtures/form4-xml.ts`
