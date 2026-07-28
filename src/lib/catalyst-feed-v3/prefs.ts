import {
  DEFAULT_FEED_V3_PREFS,
  FEED_V3_PREFS_KEY,
  type FeedV3DisplayPrefs,
} from "./version.ts";

export function loadFeedV3Prefs(): FeedV3DisplayPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_FEED_V3_PREFS };
  try {
    const raw = localStorage.getItem(FEED_V3_PREFS_KEY);
    if (!raw) return { ...DEFAULT_FEED_V3_PREFS };
    const parsed = JSON.parse(raw) as Partial<FeedV3DisplayPrefs>;
    return { ...DEFAULT_FEED_V3_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_FEED_V3_PREFS };
  }
}

export function saveFeedV3Prefs(prefs: FeedV3DisplayPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FEED_V3_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
