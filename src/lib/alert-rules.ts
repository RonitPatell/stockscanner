import type { CatalystItem } from "@/types";

export type AlertRuleChannel = "discord" | "sms" | "email" | "push";

export interface AlertRule {
  id: string;
  enabled: boolean;
  name: string;
  /** watchlist_only | any_symbol */
  scope: "watchlist" | "any";
  channels: AlertRuleChannel[];
  minChangePercent?: number;
  maxChangePercent?: number;
  minRvol?: number;
  maxFloatM?: number;
  minFloatM?: number;
  minUrgency?: number;
  catalystTypes?: string[];
  newsAttachedOnly?: boolean;
  requireHod?: boolean;
  requireVwapAbove?: boolean;
  cooldownMinutes?: number;
}

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: "default-watchlist",
    enabled: true,
    name: "Watchlist high-signal",
    scope: "watchlist",
    channels: ["discord"],
    minChangePercent: 2.5,
    minRvol: 2.2,
    minUrgency: 30,
    newsAttachedOnly: true,
    cooldownMinutes: 15,
  },
];

export function normalizeAlertRules(raw: unknown): AlertRule[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_ALERT_RULES;
  const out: AlertRule[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : `rule-${out.length}`;
    out.push({
      id,
      enabled: o.enabled !== false,
      name: typeof o.name === "string" ? o.name : "Alert rule",
      scope: o.scope === "any" ? "any" : "watchlist",
      channels: Array.isArray(o.channels)
        ? o.channels.filter(
            (c): c is AlertRuleChannel =>
              c === "discord" || c === "sms" || c === "email" || c === "push"
          )
        : ["discord"],
      minChangePercent: num(o.minChangePercent),
      maxChangePercent: num(o.maxChangePercent),
      minRvol: num(o.minRvol),
      maxFloatM: num(o.maxFloatM),
      minFloatM: num(o.minFloatM),
      minUrgency: num(o.minUrgency),
      catalystTypes: arrStr(o.catalystTypes),
      newsAttachedOnly: o.newsAttachedOnly === true,
      requireHod: o.requireHod === true,
      requireVwapAbove: o.requireVwapAbove === true,
      cooldownMinutes: num(o.cooldownMinutes) ?? 15,
    });
  }
  return out.length > 0 ? out : DEFAULT_ALERT_RULES;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function arrStr(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.map(String) : undefined;
}

export interface AlertEvalContext {
  watchlist: Set<string>;
  hodSymbols?: Set<string>;
  /**
   * Symbols trading green vs prior close (honest proxy — not true session VWAP).
   * Prefer requireHod for level-based alerts.
   */
  abovePriorCloseSymbols?: Set<string>;
  /** @deprecated Use abovePriorCloseSymbols */
  vwapAboveSymbols?: Set<string>;
}

export function catalystMatchesRule(c: CatalystItem, rule: AlertRule, ctx: AlertEvalContext): boolean {
  if (!rule.enabled) return false;

  const sym = c.symbol.toUpperCase();
  if (rule.scope === "watchlist" && !ctx.watchlist.has(sym)) return false;

  if (rule.newsAttachedOnly && !c.headline) return false;

  const move = Math.abs(c.changePercent ?? 0);
  if (rule.minChangePercent != null && move < rule.minChangePercent) return false;
  if (rule.maxChangePercent != null && move > rule.maxChangePercent) return false;

  const rvol = c.rVol ?? 0;
  if (rule.minRvol != null && rvol < rule.minRvol) return false;

  const floatM = c.floatShares != null ? c.floatShares / 1e6 : null;
  if (rule.maxFloatM != null && floatM != null && floatM > rule.maxFloatM) return false;
  if (rule.minFloatM != null && floatM != null && floatM < rule.minFloatM) return false;

  const urgency = c.urgencyScore ?? 0;
  if (rule.minUrgency != null && urgency < rule.minUrgency) return false;

  if (rule.catalystTypes?.length && c.catalystType && !rule.catalystTypes.includes(c.catalystType)) {
    return false;
  }

  if (rule.requireHod && !ctx.hodSymbols?.has(sym)) return false;

  // Legacy flag name "requireVwapAbove" — evaluate as green vs prior close only.
  // Never alias to HOD (that was lying to traders).
  if (rule.requireVwapAbove) {
    const green =
      ctx.abovePriorCloseSymbols?.has(sym) ||
      ctx.vwapAboveSymbols?.has(sym) ||
      (c.changePercent != null && c.changePercent > 0);
    if (!green) return false;
  }

  return true;
}

export function pickMatchingRules(
  c: CatalystItem,
  rules: AlertRule[],
  ctx: AlertEvalContext
): AlertRule[] {
  return rules.filter((r) => catalystMatchesRule(c, r, ctx));
}
