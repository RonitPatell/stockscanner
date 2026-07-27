/** Decision Card V3 feature flag — default OFF. */
export function isDecisionCardV3Enabled(): boolean {
  const raw =
    process.env.DECISION_CARD_V3_ENABLED ??
    process.env.NEXT_PUBLIC_DECISION_CARD_V3_ENABLED ??
    "";
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}
