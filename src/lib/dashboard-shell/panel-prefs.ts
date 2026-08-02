/**
 * Exclusive desk modes. Primary nav is Floor + Watchlist.
 * News/Scanner remain as deep-link / internal modes only.
 */

export const DESK_MODE_IDS = ["floor", "news", "watchlist", "scanner"] as const;

/** Modes shown in the View bar — keep this short on purpose. */
export const DESK_PRIMARY_MODE_IDS = ["floor", "watchlist"] as const;

export type DeskModeId = (typeof DESK_MODE_IDS)[number];
export type DeskPrimaryModeId = (typeof DESK_PRIMARY_MODE_IDS)[number];

/** @deprecated Use DeskModeId — kept for deep-link / guide compatibility. */
export type DeskPanelId = DeskModeId | "feed" | "plan" | "risk" | "review";

const STORAGE_KEY = "tt-desk-mode-v3";
const LEGACY_V2_KEY = "tt-desk-mode-v2";
const LEGACY_PANELS_KEY = "tt-desk-panels-v1";

export const DEFAULT_DESK_MODE: DeskModeId = "floor";

export const DESK_MODE_META: Record<
  DeskModeId,
  { label: string; description: string }
> = {
  floor: {
    label: "Floor",
    description: "Main desk — movers, wire, news, and chart",
  },
  news: {
    label: "News",
    description: "Full catalyst tape (use Floor for day-to-day)",
  },
  watchlist: {
    label: "Watchlist",
    description: "Your saved symbols and brief",
  },
  scanner: {
    label: "Scanner",
    description: "Advanced ranked list (deep link only)",
  },
};

/** Legacy aliases so older imports keep compiling during the cutover. */
export const DESK_PANEL_IDS = DESK_MODE_IDS;
export const DESK_PANEL_META = DESK_MODE_META;
export type DeskPanelPrefs = Record<DeskModeId, boolean>;

export const DEFAULT_DESK_PANELS: DeskPanelPrefs = {
  floor: true,
  news: false,
  watchlist: false,
  scanner: false,
};

/** Collapse retired View tabs onto Floor so the product always opens cleanly. */
export function toPrimaryDeskMode(mode: DeskModeId): DeskModeId {
  if (mode === "watchlist") return "watchlist";
  if (mode === "scanner") return "scanner"; // deep-link / e2e only
  return "floor";
}

export function sanitizeDeskMode(raw: unknown): DeskModeId {
  if (typeof raw === "string" && (DESK_MODE_IDS as readonly string[]).includes(raw)) {
    return raw as DeskModeId;
  }
  return DEFAULT_DESK_MODE;
}

export function modeToPanelPrefs(mode: DeskModeId): DeskPanelPrefs {
  return {
    floor: mode === "floor",
    news: mode === "news",
    watchlist: mode === "watchlist",
    scanner: mode === "scanner",
  };
}

export function panelPrefsToMode(prefs: DeskPanelPrefs): DeskModeId {
  for (const id of DESK_MODE_IDS) {
    if (prefs[id]) return id;
  }
  return DEFAULT_DESK_MODE;
}

export function sanitizeDeskPanels(raw: unknown): DeskPanelPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_DESK_PANELS };
  const o = raw as Record<string, unknown>;
  if (typeof o.floor === "boolean" || typeof o.news === "boolean") {
    const mode =
      o.floor === true
        ? "floor"
        : o.watchlist === true
          ? "watchlist"
          : o.scanner === true
            ? "scanner"
            : o.news === true
              ? "floor" // News tab retired — Floor already has the tape
              : DEFAULT_DESK_MODE;
    return modeToPanelPrefs(mode);
  }
  if (o.watchlist === true && o.scanner !== true) {
    return modeToPanelPrefs("watchlist");
  }
  if (o.scanner === true && o.feed !== true) return modeToPanelPrefs("scanner");
  // Old feed-on prefs → Floor (not a separate News view)
  return { ...DEFAULT_DESK_PANELS };
}

export function loadDeskMode(): DeskModeId {
  if (typeof window === "undefined") return DEFAULT_DESK_MODE;
  try {
    const modeRaw = localStorage.getItem(STORAGE_KEY);
    if (modeRaw) {
      const mode = sanitizeDeskMode(JSON.parse(modeRaw));
      // Persisted "news" from older builds → Floor
      return mode === "news" ? "floor" : mode;
    }
    // One-time migrate v2 → v3 (prefer Floor over News)
    const v2 = localStorage.getItem(LEGACY_V2_KEY);
    if (v2) {
      const mode = sanitizeDeskMode(JSON.parse(v2));
      const next = mode === "news" ? "floor" : mode;
      saveDeskMode(next);
      return next;
    }
    const legacy = localStorage.getItem(LEGACY_PANELS_KEY);
    if (legacy) {
      const next = toPrimaryDeskMode(
        panelPrefsToMode(sanitizeDeskPanels(JSON.parse(legacy)))
      );
      saveDeskMode(next === "news" ? "floor" : next);
      return next === "news" ? "floor" : next;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_DESK_MODE;
}

export function saveDeskMode(mode: DeskModeId): void {
  if (typeof window === "undefined") return;
  try {
    const stored = mode === "news" ? "floor" : mode;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    localStorage.setItem(
      LEGACY_PANELS_KEY,
      JSON.stringify(modeToPanelPrefs(stored))
    );
  } catch {
    /* ignore */
  }
}

export function loadDeskPanels(): DeskPanelPrefs {
  return modeToPanelPrefs(loadDeskMode());
}

export function saveDeskPanels(prefs: DeskPanelPrefs): void {
  saveDeskMode(panelPrefsToMode(prefs));
}

/** Map legacy ?view= destinations onto exclusive desk modes. */
export function modeFromLegacyView(
  view: string | null | undefined
): DeskModeId | null {
  const v = (view ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "floor") return "floor";
  // Advanced monitor — only via explicit deep link (not in View bar)
  if (v === "monitor" || v === "scanner") return "scanner";
  // Feed/news → Floor (tape already lives there)
  if (v === "feed" || v === "news") return "floor";
  if (v === "watchlist") return "watchlist";
  if (v === "plan" || v === "risk" || v === "review") return "floor";
  return null;
}

/** @deprecated Use modeFromLegacyView */
export function panelsFromLegacyView(
  view: string | null | undefined
): Partial<DeskPanelPrefs> | null {
  const mode = modeFromLegacyView(view);
  if (!mode) return null;
  return modeToPanelPrefs(mode);
}
