import type { CatalystItem } from "@/types";
import {
  evaluateStrategy,
  factsFromCatalyst,
} from "../alert-strategy/evaluate.ts";
import type { AlertStrategy } from "../alert-strategy/types.ts";
import { normalizeAlertStrategies } from "../alert-strategy/normalize.ts";

/**
 * Catalyst ids that currently match at least one enabled user alert strategy.
 * Presentation ranking only — does not alter classification.
 */
export function collectRuleMatchedIds(
  items: CatalystItem[],
  strategiesRaw: unknown,
  nowMs = Date.now()
): Set<string> {
  const strategies = normalizeAlertStrategies(strategiesRaw).filter(
    (s: AlertStrategy) => s.enabled !== false
  );
  const matched = new Set<string>();
  if (strategies.length === 0) return matched;

  for (const c of items) {
    const facts = factsFromCatalyst(c);
    for (const s of strategies) {
      try {
        const result = evaluateStrategy(s, facts, c, { nowMs });
        if (result.matched) {
          matched.add(c.id);
          break;
        }
      } catch {
        /* ignore bad strategy */
      }
    }
  }
  return matched;
}
