import { ALERT_STRATEGY_SCHEMA_VERSION } from "./version.ts";
import { parseStrategy } from "./export-import.ts";
import { buildPreset } from "./presets.ts";
import type { AlertStrategy } from "./types.ts";

/**
 * Normalize user-stored alertStrategies JSON.
 * Never silently mutates content — only repairs shape / missing defaults.
 * Returns a *copy*; callers must explicitly save to persist repairs.
 */
export function normalizeAlertStrategies(raw: unknown): AlertStrategy[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: AlertStrategy[] = [];
  for (const item of raw) {
    const parsed = parseStrategy(item);
    if (parsed) {
      if (!parsed.schemaVersion) {
        parsed.schemaVersion = ALERT_STRATEGY_SCHEMA_VERSION;
      }
      out.push(parsed);
    }
  }
  return out;
}

/** Seed a single custom preset when user has no strategies yet (UI only — not silent overwrite of existing). */
export function defaultStrategiesIfEmpty(raw: unknown): AlertStrategy[] {
  const existing = normalizeAlertStrategies(raw);
  if (existing.length > 0) return existing;
  return [buildPreset("custom")];
}
