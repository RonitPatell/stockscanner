/**
 * Company-level What Changed feed.
 */

export { COMPANY_WHAT_CHANGED_VERSION } from "./types.ts";
export type {
  CompanyWhatChangedCard,
  CompanyWhatChangedFeed,
  CompanyWhatChangedFeedMeta,
  ThesisRelevanceDto,
  WhatChangedAccessMode,
  WhatChangedWindow,
  EventRowForWhatChanged,
  ThesisConditionOverlayInput,
} from "./types.ts";
export { WHAT_CHANGED_WINDOWS } from "./types.ts";

export {
  isWhatChangedWindow,
  resolveWhatChangedSince,
  startOfCalendarQuarter,
} from "./windows.ts";

export { isRoutineActivity } from "./routine.ts";

export {
  buildCompanyWhatChangedFeed,
  PUBLIC_PREVIEW_LIMIT,
  ENTITLED_FEED_LIMIT,
} from "./build-feed.ts";

export {
  mapEventToWhatChangedCard,
  mapFinancialDeltaCard,
  parseEventSignificance,
} from "./map-event.ts";

export {
  scoreThesisRelevance,
  sanitizeThesisRelevanceForClient,
} from "./thesis-overlay.ts";

export {
  getCompanyWhatChangedFeed,
  getTickerWhatChangedEvents,
  resolveWhatChangedAccess,
} from "./get-feed.ts";

export type { GetCompanyWhatChangedOpts } from "./get-feed.ts";

export {
  loadTickerLastView,
  saveTickerLastView,
  tickerLastViewStorageKey,
} from "./last-view.ts";

/** @deprecated legacy shape — prefer CompanyWhatChangedCard */
export type TickerWhatChangedEvent = {
  id: string;
  title: string;
  summary: string | null;
  category: string;
  severity: string;
  occurredAt: Date;
  sourceUrl: string | null;
};
