# TrustTicker Monitor — Rollback Runbook

**Goal:** Restore a safe desk (Feed / legacy dashboard) within minutes without rewriting market history.  
**Principle:** Prefer control-plane rollback over redeploy when possible.

---

## 1. One-click rollback (preferred)

1. Open `/admin/monitor-ops` as an `ADMIN_EMAILS` user.  
2. Under **Staged rollout**, click **One-click rollback**.  
3. Confirm the browser dialog (server requires `confirm: "ONE_CLICK_ROLLBACK"`).  
4. Expected effect:
   - `monitorGloballyDisabled = true`
   - `featureFlagCohort = monitor-v1-rollback`
   - Monitor SSE/snapshot refuse new live work where gated
   - Traders keep **Feed** and **old dashboard** (`/dashboard?shell=legacy`)

5. Verify:
   - Admin account: Monitor shows unavailable / beta chrome opt paths  
   - `/dashboard?view=feed` loads  
   - `/dashboard?shell=legacy` loads  
   - Audit log shows `one_click_rollback`

---

## 2. Env / deploy rollback (if control plane unavailable)

Set and redeploy:

```text
MONITOR_V1=false
NEXT_PUBLIC_MONITOR_V1=false
MONITOR_ENABLED=false
NEXT_PUBLIC_MONITOR_ENABLED=false
MARKET_STREAM_V1=false
MONITOR_LIVE_DELIVERY=false
MONITOR_ROLLOUT_STAGE=
```

Optional subsystem offs:

```text
MOMENTUM_FIELD_V1=false
MONITOR_SQUAWK_V1=false
MONITOR_REPLAY_V1=false
```

Workers/crons: leave additive migrations in place; do **not** drop columns.

---

## 3. Partial rollbacks

| Symptom | Action |
|---------|--------|
| Stream overload | Disable `marketStreamV1` / `MONITOR_LIVE_DELIVERY` only |
| Field jank | `MOMENTUM_FIELD_V1=false` — ladder remains |
| Squawk noise | `MONITOR_SQUAWK_V1=false` |
| Bad engine version | Ops → disable calculation version |
| Single ticker poison | Quarantine ticker (ops control) |
| Wrong cohort breadth | Set stage back to prior `stage_*` (gates reset after advance) |

---

## 4. Communications

- Tell testers: use Feed or Old dashboard links in beta chrome.  
- Do **not** claim “service restored to SLA” — state facts only (Monitor disabled; Feed available).  
- Capture feedback via Monitor beta feedback or founder chat; scrub private notes.

---

## 5. After rollback

- [ ] File incident note (reliability admin if customer-facing)  
- [ ] Preserve audit rows — do not delete  
- [ ] Reprocess only via **derived** replay sessions (never silent history rewrite)  
- [ ] Re-enter stage 1 only after expansion gates re-attested  
- [ ] Update support doc with known issue + workaround

---

## 6. What rollback does *not* do

- Does not delete user watchlists, feedback, or Stripe state  
- Does not rewrite replay source frames  
- Does not remove Prisma columns  
- Does not invent resumption times or profitability claims
