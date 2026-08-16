# Event significance scoring

Deterministic **review priority** for `CompanyEvent` rows.  
This is **not** a buy/sell score, price prediction, or universal “risk score.”

Engine: `src/lib/company-events/significance.ts`  
Version: `EVENT_SIGNIFICANCE_VERSION` (`1.0.0`)

## Output shape

Every call to `scoreEventSignificance(input)` returns:

| Field | Meaning |
|-------|---------|
| `level` | `HIGH` \| `MEDIUM` \| `LOW` \| `INFORMATIONAL` |
| `reasonCodes[]` | Deterministic codes that fired |
| `evidence[]` | `{ code, detail, source }` for each fire |
| `engineVersion` | Rule pack version |
| `thesisRelevance` | Always `null` in v1 — reserved for user thesis overlay |

Persisted into `CompanyEvent.evidenceJson.significance`.  
`CompanyEvent.severity` is mapped for sort/filter only:

| Significance | Legacy severity column |
|--------------|------------------------|
| HIGH | `critical` |
| MEDIUM | `material` |
| LOW | `notable` |
| INFORMATIONAL | `info` |

## Aggregation

1. Collect all matching rules (event type, text cues, structured evidence).
2. `level` = max priority among fires (excluding the confidence softener alone).
3. If classifier `confidence < 0.45`, cap level at **MEDIUM** (avoid false drama).
4. If nothing matches → **INFORMATIONAL** + `NO_MATERIAL_IMPACT_EVIDENCE`.

## Reason codes (complete list)

### HIGH

| Code | When it fires |
|------|----------------|
| `GOING_CONCERN` | Text: “going concern” / substantial-doubt language |
| `BANKRUPTCY_RECEIVERSHIP` | Event type `bankruptcy_receivership` / `bankruptcy`, or Chapter 11 / receivership text |
| `AUDITOR_RESIGNATION_OR_DISMISSAL` | Event type `auditor_change` |
| `RESTATEMENT_OR_NON_RELIANCE` | Event type `non_reliance_restatement`, or restatement / non-reliance text |
| `MAJOR_CAPITAL_RAISE` | `registered_direct`, `offering_priced`, `share_issuance`; 424B5 types (medium baseline may co-fire); evidence `announced_sale` / `confirmed_issuance`; large $ capacity may also fire MEDIUM |
| `MAJOR_MANAGEMENT_DEPARTURE` | Event type `management_change`, or CEO/CFO resign/depart text |
| `LATE_PERIODIC_REPORT` | `sec_nt_10k`, `sec_nt_10q` |
| `SUBSTANTIAL_SHARE_COUNT_INCREASE` | Evidence `maxShares / sharesOutstandingDenom ≥ 0.20`; reverse split also tags this at MEDIUM via event type |
| `IMPAIRMENT_DISCLOSURE` | Event type `impairment` |

### MEDIUM

| Code | When it fires |
|------|----------------|
| `NEW_SHELF_REGISTRATION` | Shelf / S-1 / S-3 registration capacity events |
| `OWNERSHIP_THRESHOLD_CHANGE` | 13D / 13G (and 13D/A) beneficial ownership events |
| `NEW_DEBT_OR_MATERIAL_AGREEMENT` | `material_agreement` |
| `MATERIAL_MARGIN_OR_RESULTS` | Results 8-K, earnings release, metric deltas |
| `INSIDER_OPEN_MARKET_SALE` | Form 4 with open-market sale cues, or `insider_sale` |
| `ATM_PROGRAM_DETECTED` | `atm_program` (capacity ≠ completed sale) |
| `CONVERTIBLE_OR_WARRANT_CAPITAL` | Convertible / warrant event types |
| `DIRECTOR_OR_BOARD_CHANGE` | Director / board change events |

### LOW

| Code | When it fires |
|------|----------------|
| `ROUTINE_PERIODIC_FILING` | `sec_10k`, `sec_10q` (text may still elevate via going concern) |
| `ROUTINE_OWNERSHIP_AMENDMENT` | 13G/A, 13F-style updates |
| `ROUTINE_INSIDER_FORM` | Form 3/4/5/144 without sale/grant elevation |
| `EFFECTIVE_REGISTRATION_NOTICE` | EFFECT / effective registration |
| `PROXY_OR_ADMINISTRATIVE` | DEF 14A / meeting / charter administrative |
| `ADMINISTRATIVE_FILING` | Generic `sec_8k` without higher item |

### INFORMATIONAL

| Code | When it fires |
|------|----------------|
| `ROUTINE_COMPENSATION_GRANT` | Grant / RSU / option award language or `insider_grant` |
| `NO_MATERIAL_IMPACT_EVIDENCE` | No rule matched |
| `UNKNOWN_OR_INSUFFICIENT_EVIDENCE` | `sec_other` / unresolved form |
| `LOW_CLASSIFIER_CONFIDENCE` | Confidence &lt; 0.45 (softener; caps escalation) |
| `ADMINISTRATIVE_FILING` | Also used for thin generic filings when applicable |

## Explicit non-goals

- No predicted return, “risk score” 0–100, or buy/sell recommendation.
- Shelf registration alone is **not** treated as a completed dilution sale.
- Thesis / portfolio personalization is **not** applied in v1 (`thesisRelevance: null`).

## Extending

1. Add a `SIGNIFICANCE_REASON_CODES` entry.
2. Add a deterministic fire condition in `scoreEventSignificance`.
3. Document the code in this file.
4. Add a unit test named after the reason code in `tests/event-significance.test.mts`.
5. Bump `EVENT_SIGNIFICANCE_VERSION` when rule semantics change.
