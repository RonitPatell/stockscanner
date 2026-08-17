# Capital Risk

Factual financing / dilution **exposure** posture — not a prediction that a company will issue shares.

Engine: `src/lib/capital-risk/` (`CAPITAL_RISK_ENGINE_VERSION`)  
Reuses: `DilutionInstrument`, Dilution Radar, timelines, SEC extract, conflicts.

## User-facing levels

| Level | Label |
|-------|--------|
| `low` | Low capital risk |
| `moderate` | Moderate capital risk |
| `elevated` | Elevated capital risk |
| `unknown` | Unknown capital risk |

Every evaluation includes **reason codes**. Never “will dilute” / “dilution guaranteed”.

## Sections (ticker Capital tab)

1. **Liquidity** — cash, operating cash flow, estimated runway when burn is defensible  
2. **Share structure** — shares outstanding, YoY change, multi-year when enough observations  
3. **Financing events** — S-3, EFFECT, 424B5, ATM, warrants, convertibles, issuance, reverse splits  
4. **Dilution timeline** — existing instrument timeline

## Runway rules

- Burn from **negative** quarterly OCF only  
- If OCF ≥ 0 → burn not applicable → runway unknown  
- If OCF missing / irregular → unknown  
- Never invent runway

## Persistence

`CapitalRiskSnapshot` stores status + `metricsJson` (reasons, liquidity, share structure).  
On **level change** → CompanyEvent `capital_risk_level_change` (derived) + Thesis Health schedule.

## API

`GET /api/ticker/[symbol]/capital-risk` → `{ report, timeline }`

## Nav

Structure removed from **primary** Investor OS nav. Deep link preserved: `?view=structure` / `?view=capital-risk` → Capital Risk desk (Dilution Radar). Per-ticker: `?tab=capital`.

## Tests

`tests/capital-risk.test.mts`
