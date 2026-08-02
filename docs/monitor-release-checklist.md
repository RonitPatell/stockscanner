# TrustTicker Monitor — Staged Release Checklist

**Audience:** Ops / engineering before each cohort expansion.  
**Rule:** Do **not** describe beta observations as achieved service guarantees, SLAs, latency promises, or profitability.

Related: [Rollback runbook](./monitor-rollback-runbook.md) · [Rollout plan](./monitor-rollout.md) · Admin UI `/admin/monitor-ops`

---

## Feature flags (logical ids)

| Flag | Env (examples) | Role |
|------|----------------|------|
| `monitorV1` | `MONITOR_V1` / `NEXT_PUBLIC_MONITOR_V1` | Master trader surface |
| `marketStreamV1` | `MARKET_STREAM_V1` / `MONITOR_LIVE_DELIVERY` | Live SSE / stream (opt-in) |
| `momentumEngineV1` | `MOMENTUM_ENGINE_V1` / `MONITOR_MOMENTUM_V1` | Momentum engine |
| `priorityEngineV1` | `PRIORITY_ENGINE_V1` | Attention / priority engine |
| `momentumFieldV1` | `MOMENTUM_FIELD_V1` | Spatial Momentum Field UI |
| `monitorSquawkV1` | `MONITOR_SQUAWK_V1` | Audio squawk bar |
| `monitorReplayV1` | `MONITOR_REPLAY_V1` | Admin replay |

Cohort stage: `MONITOR_ROLLOUT_STAGE` or ops `featureFlagCohort`  
(`stage_1_internal_admins` … `stage_6_full`).

Allowlists: `MONITOR_TRUSTED_TESTER_EMAILS`, `MONITOR_FOUNDING_USER_EMAILS`, `ADMIN_EMAILS`.

---

## Cohorts

| Stage | Who |
|-------|-----|
| 1 | Internal admins |
| 2 | + ~5 trusted testers |
| 3 | + ~25 founding users |
| 4 | + sticky 10% eligible Pro subscribers |
| 5 | + sticky 50% |
| 6 | Full eligible rollout |

Eligible = active subscription (Pro). Per-user **opt-out** always wins. One-click rollback disables Monitor for everyone.

---

## Before each expansion (all required)

Attest in `/admin/monitor-ops` → **Staged rollout** → Expansion gates, then **Set stage (gated)**.

- [ ] No P0 security findings
- [ ] No cross-user isolation failures (`npm run test:monitor-security` + spot IDOR checks)
- [ ] Acceptable provider health (ops Live operations / provider table)
- [ ] No unresolved migration issues (`prisma migrate` / `db push` clean)
- [ ] No major leader-flapping defect
- [ ] No stale-data-as-live defect
- [ ] No severe browser performance regression
- [ ] Support documentation updated (this file + support FAQ pointers)
- [ ] Platform Guide updated (`PLATFORM_GUIDE_VERSION` bump if UI changed)

Also verify:

- [ ] Build id + engine versions visible in admin diagnostics
- [ ] One-click rollback tested in staging within last 7 days
- [ ] Old dashboard fallback (`?shell=legacy`) and Feed (`?view=feed`) work
- [ ] Beta feedback + scrubbed error sessions reachable
- [ ] No copy claiming SLA / guaranteed speed / predicted profit

---

## Per-stage smoke

1. Admin account: Monitor loads; Guide targets present.  
2. Outside-cohort Pro: Monitor unavailable reason shown; Feed works.  
3. Opt-out user: stays on Feed/legacy until rejoin.  
4. Live stream only if `marketStreamV1` on; otherwise fixtures/degraded labels honest.  
5. Isolation: user A presets/watchlist/stream inaccessible as user B.

---

## Observational metrics (not guarantees)

Record for learning only: cohort size, error-session count, feedback themes, drop/lag counters, leader transitions.  
**Never** publish these as uptime %, sub-second delivery, or edge guarantees.
