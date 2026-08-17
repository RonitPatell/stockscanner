/**
 * Pure feed builder — filter, sort, cap. No DB.
 */

import { mapEventToWhatChangedCard, mapFinancialDeltaCard } from "./map-event.ts";
import { sanitizeThesisRelevanceForClient, scoreThesisRelevance } from "./thesis-overlay.ts";
import type {
  CompanyWhatChangedCard,
  CompanyWhatChangedFeed,
  EventRowForWhatChanged,
  ThesisConditionOverlayInput,
  WhatChangedAccessMode,
  WhatChangedWindow,
} from "./types.ts";
import { COMPANY_WHAT_CHANGED_VERSION } from "./types.ts";

export const PUBLIC_PREVIEW_LIMIT = 8;
export const ENTITLED_FEED_LIMIT = 40;

export function buildCompanyWhatChangedFeed(opts: {
  symbol: string;
  events: EventRowForWhatChanged[];
  window: WhatChangedWindow;
  since: Date | null;
  until: Date | null;
  showAllActivity: boolean;
  accessMode: WhatChangedAccessMode;
  usedFallbackWindow: boolean;
  fallbackWindow: WhatChangedWindow | null;
  /** Entitled only — never pass on public */
  thesisConditions?: ThesisConditionOverlayInput[] | null;
  /** Optional supplemental financial lines */
  financialDeltaLines?: string[];
  financialDeltaAsOf?: string | null;
  financialDeltaSourceUrl?: string | null;
  now?: number;
}): CompanyWhatChangedFeed {
  const sym = opts.symbol.trim().toUpperCase();
  const now = opts.now ?? Date.now();
  const entitled = opts.accessMode === "entitled";
  const conditions =
    entitled && opts.thesisConditions?.length ? opts.thesisConditions : null;

  const mapped: CompanyWhatChangedCard[] = opts.events.map((row) => {
    const thesisRelevance =
      conditions != null
        ? sanitizeThesisRelevanceForClient(
            scoreThesisRelevance({ event: row, conditions })
          )
        : null;
    return mapEventToWhatChangedCard(row, { now, thesisRelevance });
  });

  // Supplemental financial card when material deltas exist and no financial event in set
  if (
    opts.financialDeltaLines &&
    opts.financialDeltaLines.length > 0 &&
    opts.financialDeltaAsOf
  ) {
    const hasFinancial = mapped.some((c) => c.domain === "financial_delta");
    if (!hasFinancial) {
      const fin = mapFinancialDeltaCard({
        symbol: sym,
        asOf: opts.financialDeltaAsOf,
        lines: opts.financialDeltaLines,
        sourceUrl: opts.financialDeltaSourceUrl,
        now,
      });
      if (conditions) {
        fin.thesisRelevance = sanitizeThesisRelevanceForClient(
          scoreThesisRelevance({
            event: {
              eventType: fin.eventType,
              category: fin.category,
              title: fin.whatHappened,
            },
            conditions,
          })
        );
      }
      mapped.push(fin);
    }
  }

  mapped.sort(
    (a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()
  );

  const totalBeforeFilter = mapped.length;
  const routineHidden = mapped.filter((c) => c.isRoutine);
  let visible = opts.showAllActivity
    ? mapped
    : mapped.filter((c) => !c.isRoutine);

  const limit = entitled ? ENTITLED_FEED_LIMIT : PUBLIC_PREVIEW_LIMIT;
  const previewCapped = visible.length > limit;
  visible = visible.slice(0, limit);

  // Public: force-strip thesis on every card (defense in depth)
  if (!entitled) {
    for (const c of visible) c.thesisRelevance = null;
  }

  const empty = visible.length === 0;
  const emptyMessage = buildEmptyMessage({
    symbol: sym,
    showAllActivity: opts.showAllActivity,
    totalBeforeFilter,
    routineHiddenCount: routineHidden.length,
    window: opts.window,
    usedFallbackWindow: opts.usedFallbackWindow,
  });

  return {
    cards: visible,
    empty,
    emptyMessage,
    meta: {
      version: COMPANY_WHAT_CHANGED_VERSION,
      symbol: sym,
      window: opts.window,
      since: opts.since?.toISOString() ?? null,
      until: opts.until?.toISOString() ?? null,
      showAllActivity: opts.showAllActivity,
      accessMode: opts.accessMode,
      usedFallbackWindow: opts.usedFallbackWindow,
      fallbackWindow: opts.fallbackWindow,
      totalBeforeFilter,
      routineHiddenCount: opts.showAllActivity ? 0 : routineHidden.length,
      previewCapped,
      hasThesis: Boolean(conditions?.length),
    },
  };
}

function buildEmptyMessage(opts: {
  symbol: string;
  showAllActivity: boolean;
  totalBeforeFilter: number;
  routineHiddenCount: number;
  window: WhatChangedWindow;
  usedFallbackWindow: boolean;
}): string {
  if (
    !opts.showAllActivity &&
    opts.routineHiddenCount > 0 &&
    opts.totalBeforeFilter === opts.routineHiddenCount
  ) {
    return `Nothing meaningful changed for ${opts.symbol} in this window. Routine filings were hidden — turn on Show all activity to see them.`;
  }
  if (opts.totalBeforeFilter === 0) {
    return `Nothing meaningful changed for ${opts.symbol} in this window.`;
  }
  return `Nothing meaningful changed for ${opts.symbol} in this window.`;
}
