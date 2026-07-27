/** Alert Backbone V2 — opt-in until validated in staging. Default: on when unset. */
export function isAlertBackboneV2Enabled(): boolean {
  const v = process.env.ALERT_BACKBONE_V2_ENABLED;
  if (v == null || v === "") return true;
  return !/^(0|false|off|no)$/i.test(v);
}

/** When true, skip quote/float/historical on the critical path and enqueue enrichment. */
export function isPreliminaryPublishEnabled(): boolean {
  if (!isAlertBackboneV2Enabled()) return false;
  const v = process.env.ALERT_BACKBONE_PRELIMINARY_ENABLED;
  if (v == null || v === "") return true;
  return !/^(0|false|off|no)$/i.test(v);
}
