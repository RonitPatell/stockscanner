# TrustTicker Company Event Engine

Deterministic classifier that turns primary-source SEC disclosures into shared `CompanyEvent` rows. **No LLM.** Does not replace `Catalyst` or `DilutionInstrument`.

## Pipeline (reuse existing ingest)

```
SEC Atom (sec-edgar.ts + sec-politeness)
  → ingest runner / wire cron
  → Catalyst upsert (unchanged for consumers)
  → processCatalystForDilution (capital instruments)
  → processCatalystForCompanyEvents (filing + item + capital events)
```

Hook: `src/lib/catalyst-engine.ts` (fire-and-forget beside dilution).

## Supported SEC forms (classifier)

| Form | Base eventType | Category |
|------|----------------|----------|
| 8-K | `sec_8k` | filing |
| 10-Q | `sec_10q` | filing |
| 10-K | `sec_10k` | filing |
| NT 10-Q | `sec_nt_10q` | filing |
| NT 10-K | `sec_nt_10k` | filing |
| S-1 | `sec_s1` | capital |
| S-1/A | `sec_s1_a` | capital |
| S-3 | `sec_s3` | capital |
| S-3/A | `sec_s3_a` | capital |
| 424B5 | `sec_424b5` | capital |
| EFFECT | `sec_effect` | capital |
| DEF 14A | `sec_def_14a` | governance |
| Form 3 | `sec_form3` | insider |
| Form 4 | `sec_form4` (+ `insider_form4`) | insider |
| Form 5 | `sec_form5` | insider |
| Form 144 | `sec_form144` | insider |
| Schedule 13D | `sec_13d` (+ `beneficial_ownership_13d`) | ownership |
| 13D/A | `sec_13d_a` | ownership |
| Schedule 13G | `sec_13g` (+ `beneficial_ownership_13g`) | ownership |
| 13G/A | `sec_13g_a` | ownership |

EDGAR Atom polling in `sec-edgar.ts` covers these forms (bounded counts + aggregate RPS).

## Material 8-K items (evidence required)

Only emitted when Item codes or clear phrases match title/summary/body:

| Evidence | eventType |
|----------|-----------|
| Item 4.01 / auditor change | `auditor_change` |
| Item 5.02 / officer language | `management_change` |
| Director resign/appoint | `director_change` |
| Item 1.01 material agreement | `material_agreement` |
| Item 1.03 / bankruptcy | `bankruptcy_receivership` |
| Item 2.06 impairment | `impairment` |
| Item 2.02 / earnings release | `financial_results_8k` |
| Item 4.02 / non-reliance | `non_reliance_restatement` |

If confidence is insufficient → **form-level event only** (`sec_8k` or `sec_other`). Never invent items.

## Capital events (from Dilution Radar)

Emitted only when dilution extraction confidence ≥ `CAPITAL_EVENT_MIN_CONFIDENCE` (0.55):

| Instrument | eventType |
|------------|-----------|
| S3_SHELF | `shelf_registration` |
| S1_REGISTRATION | `s1_registration` |
| PROSPECTUS_424B5 | `prospectus_424b5` |
| ATM_PROGRAM | `atm_program` |
| REGISTERED_DIRECT | `registered_direct` |
| CONVERTIBLE_* | `convertible_instrument` |
| WARRANT | `warrant_issuance` |
| WARRANT_REPRICE | `warrant_reprice` |
| SHARES_OUTSTANDING_CHANGE | `share_issuance` |
| REVERSE_SPLIT | `reverse_split` |
| EFFECTIVE_REGISTRATION | `effective_registration` |

Shelf / registration capacity events keep factual labels — **shelf ≠ confirmed sale**.

## Idempotency

`filingEventFingerprint(symbol, eventType, accession|rawNewsId, discriminant)` — unique on `CompanyEvent.fingerprint`. Reprocessing the same filing upserts safely.

## Code map

| Concern | Path |
|---------|------|
| Taxonomy | `src/lib/company-events/types.ts` |
| Form map | `src/lib/company-events/forms.ts` |
| Classifier | `src/lib/company-events/classify.ts` |
| Capital map | `src/lib/company-events/capital-map.ts` |
| Persist | `src/lib/company-events/persist.ts` |
| Catalyst hook | `src/lib/company-events/from-catalyst.ts` |
| Tests | `tests/company-event-engine.test.mts` |
| Fixtures | `tests/fixtures/company-events.ts` (+ dilution fixtures) |
