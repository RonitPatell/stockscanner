/**
 * Analytics / payload scrubbing for trader feedback.
 * Never send phone, email, watchlist contents, webhooks, or private notes.
 */

const BANNED = [
  "phone",
  "phonenumber",
  "email",
  "watchlist",
  "webhook",
  "discordwebhook",
  "password",
  "passwordhash",
  "pushsubscription",
  "privatenote",
  "note",
  "reasonnote",
];

export function scrubFeedbackAnalyticsProps(
  props: Record<string, unknown> | null | undefined
): Record<string, string | number | boolean> {
  if (!props) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    const lower = k.toLowerCase().replace(/[_-]/g, "");
    if (BANNED.some((b) => lower === b || lower.includes(b))) continue;
    if (v == null) continue;
    if (typeof v === "string") {
      if (/@/.test(v) || /^\+?\d{10,}$/.test(v) || /webhook/i.test(v)) continue;
      if (/^[A-Z]{1,5}(,[A-Z]{1,5}){5,}$/.test(v)) continue;
      out[k] = v.slice(0, 64);
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}

/** Safe aggregate for analytics — counts only */
export function feedbackAnalyticsSafeSummary(opts: {
  action: string;
  reason?: string | null;
  syncOptIn: boolean;
}): Record<string, string | number | boolean> {
  return scrubFeedbackAnalyticsProps({
    action: opts.action,
    reason: opts.reason ?? null,
    syncOptIn: opts.syncOptIn,
    kind: "trader_feedback",
  });
}
