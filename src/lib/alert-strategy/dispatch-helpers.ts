/**
 * Thin re-exports for watchlist-alerts dispatch (keeps strategy module boundary clean).
 */
export { normalizeAlertStrategies } from "./normalize.ts";
export { evaluateStrategy, factsFromCatalyst } from "./evaluate.ts";
export { marketSessionAt } from "./sessions.ts";
export {
  checkStrategyCooldown,
  recordStrategyFire,
} from "./cooldown.ts";
import { detectRiskOnlyCatalyst } from "../alerts/modes.ts";
import type { CatalystItem } from "@/types";

export function detectRiskDilutionFlags(c: CatalystItem): string[] {
  return detectRiskOnlyCatalyst(c).tags;
}
