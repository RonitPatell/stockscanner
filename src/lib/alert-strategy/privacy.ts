/**
 * Privacy helpers — phone numbers and private watchlists must never enter analytics.
 */

const BANNED_KEYS = [
  "phone",
  "phonenumber",
  "watchlist",
  "watchlistsymbols",
  "discordwebhook",
  "webhook",
  "password",
  "passwordhash",
  "pushsubscription",
];

export function scrubStrategyAnalyticsProps(
  props: Record<string, unknown> | undefined | null
): Record<string, string | number | boolean> {
  if (!props) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    const lower = k.toLowerCase().replace(/[_-]/g, "");
    if (BANNED_KEYS.some((b) => lower === b || lower.includes(b))) continue;
    if (v == null) continue;
    if (typeof v === "string") {
      if (/@/.test(v) || /^\+?\d{10,}$/.test(v) || /webhook/i.test(v)) continue;
      // Never pass comma-separated ticker lists that look like full watchlists
      if (/^[A-Z]{1,5}(,[A-Z]{1,5}){5,}$/.test(v)) continue;
      out[k] = v.slice(0, 64);
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}

/** Safe summary for analytics — counts only, never symbol lists or PII */
export function strategyAnalyticsSafeSummary(strategy: {
  id: string;
  version: number;
  delivery: string;
  presetId: string;
  enabled: boolean;
  channels: string[];
}): Record<string, string | number | boolean> {
  return scrubStrategyAnalyticsProps({
    strategyId: strategy.id.slice(0, 24),
    version: strategy.version,
    delivery: strategy.delivery,
    presetId: strategy.presetId,
    enabled: strategy.enabled,
    channelCount: strategy.channels.length,
  });
}

/**
 * Strip private strategy contents before any analytics / telemetry sink.
 * Never includes condition trees, mutes, notes, or channel secrets.
 */
export function monitorPresetAnalyticsSafe(strategy: {
  id: string;
  version: number;
  presetId: string;
  enabled: boolean;
}): Record<string, string | number | boolean> {
  return scrubStrategyAnalyticsProps({
    strategyId: strategy.id.slice(0, 24),
    version: strategy.version,
    presetId: strategy.presetId,
    enabled: strategy.enabled,
    surface: "monitor_preset",
  });
}
