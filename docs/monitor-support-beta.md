# TrustTicker Monitor — Support notes (beta)

Short support-facing copy for staged rollout. Not marketing. Not SLAs.

## What traders can do

- **Use Monitor** when their account is in the current cohort and they have not opted out.
- **Open Feed** anytime: `/dashboard?view=feed`
- **Open old dashboard** anytime: `/dashboard?shell=legacy`
- **Opt out of Monitor beta** from the Monitor beta bar (keeps Pro; only Monitor hides).
- **Send feedback** from the same bar — do not paste private financial notes.

## What to tell users

- Monitor is informational inspection only — not trade instructions.
- Stale or degraded data is labelled; do not treat it as live.
- Beta observations (errors, lag counters, cohort size) are **not** uptime or speed guarantees.

## Escalation

- Security / cross-user issues → page on-call; do not expand cohort.
- Need kill-switch → `/admin/monitor-ops` → **One-click rollback** (see [rollback runbook](./monitor-rollback-runbook.md)).
- Before expansion → [release checklist](./monitor-release-checklist.md).
