import { getActiveHalt, buildHaltCardModel } from "./index.ts";
import type { DecisionCardV3Model } from "../decision-card/types.ts";

/** Load halt strip for Decision Card enrichment (async). */
export async function loadHaltMonitorForCard(
  symbol: string
): Promise<NonNullable<DecisionCardV3Model["haltMonitor"]> | null> {
  const halt = await getActiveHalt(symbol);
  if (!halt) return null;
  const card = await buildHaltCardModel(symbol, halt);
  if (!card.active && !(card.sessionHaltCount && card.sessionHaltCount > 0)) {
    return null;
  }
  return {
    active: card.active,
    haltCode: card.haltCode,
    haltCodeTitle: card.haltCodeTitle,
    lifecycle: card.lifecycle,
    resumptionQuoteLabel: card.resumptionQuoteLabel,
    resumptionTradeLabel: card.resumptionTradeLabel,
    sessionHaltCount: card.sessionHaltCount,
    newsDisseminationStatus: card.newsDisseminationStatus,
    reconciliationStatus: card.reconciliationStatus,
    catalystCount: card.catalystCount,
    disclaimer: card.disclaimer,
  };
}
