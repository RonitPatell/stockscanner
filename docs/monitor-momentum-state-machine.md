# Momentum State Machine (`monitor-momentum-state-v1.0`)

Deterministic lifecycle labels for **market activity structure**.  
States describe what the tape is doing — **not** buy/sell opportunities.

## States

| State | Meaning (plain language) |
|---|---|
| `DORMANT` | Quiet activity |
| `EMERGING` | Activity rising from quiet |
| `BUILDING` | Sustained build in intensity/participation |
| `BREAKING` | Sharp break higher with acceleration |
| `ACTIVE` | Elevated activity established |
| `COOLING` | Intensity slope turning down from active |
| `FADING` | Activity decaying toward quiet |
| `RECLAIMING` | Post-cool attempt to reclaim intensity |
| `HALTED` | Trading halt (overrides all) |
| `UNKNOWN` | Critical data stale/missing, or post-halt before reliable tape |

## Inputs

- Momentum intensity + slope  
- Price direction + acceleration  
- Volume / trade-rate participation  
- HOD/LOD interaction  
- Reaction stage  
- Halt status (+ resumption reliability)  
- Data freshness  
- Session + liquidity cohort (threshold config)

## Overrides

1. **`HALTED`** — if halted, always; overrides every other state.  
2. **`UNKNOWN`** — critical data stale, or intensity missing, or halt cleared but `resumptionDataReliable` is false.  
3. Calculated states only when overrides do not apply.

## Hysteresis & dwell

- Exit bands use `intensityHysteresis` so borderline flicker does not flip states.  
- Minimum dwell times apply to EMERGING → ACTIVE path states (session/liquidity adjusted).  
- Overrides (`HALTED`, `UNKNOWN`) ignore dwell.

## Transition table (permitted)

Rows = **from**, columns = **to**. `✓` = permitted.  
`any→HALTED` and `any→UNKNOWN` are always permitted (override columns marked for all rows).

| From \\ To | DORMANT | EMERGING | BUILDING | BREAKING | ACTIVE | COOLING | FADING | RECLAIMING | HALTED | UNKNOWN |
|---|---|---|---|---|---|---|---|---|---|---|
| DORMANT | ✓ | ✓ | | | | | | | ✓ | ✓ |
| EMERGING | ✓ | ✓ | ✓ | | | | | | ✓ | ✓ |
| BUILDING | | ✓ | ✓ | ✓ | | ✓ | | | ✓ | ✓ |
| BREAKING | | | ✓ | ✓ | ✓ | ✓ | | | ✓ | ✓ |
| ACTIVE | | | | ✓ | ✓ | ✓ | | | ✓ | ✓ |
| COOLING | | | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| FADING | ✓ | | | | | | ✓ | ✓ | ✓ | ✓ |
| RECLAIMING | | | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| HALTED | | | | | | | | | ✓ | ✓ |
| UNKNOWN | ✓ | ✓ | ✓ | | | ✓ | ✓ | | ✓ | ✓ |

### Notable prohibited edges

| From | To | Why |
|---|---|---|
| DORMANT | ACTIVE / BREAKING | Cannot skip build-up |
| EMERGING | ACTIVE / BREAKING | Must pass BUILDING |
| BUILDING | ACTIVE | Must pass BREAKING |
| FADING | BREAKING / ACTIVE | Cannot jump from fade |
| ACTIVE | DORMANT | Must cool/fade first |
| HALTED | ACTIVE / BREAKING / EMERGING | Must go HALTED → UNKNOWN before resume path |
| UNKNOWN | BREAKING / ACTIVE | Cannot enter peak states directly from unknown |
| RECLAIMING | BREAKING | Reclaim goes BUILDING/ACTIVE, not BREAKING |

## Incremental / causal rules

- Recompute from prior symbol memory + new sample.  
- Samples with `asOfMs` earlier than the last accepted sample are ignored (no future / no rewind).  
- Slope may be supplied or estimated from the prior intensity at the prior `asOfMs` only.

## Versioning

Every snapshot and transition records `calcVersion = monitor-momentum-state-v1.0`.

## Tests

`npm run test:monitor-momentum-state`
