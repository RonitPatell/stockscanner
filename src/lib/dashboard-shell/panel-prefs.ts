/**
 * Exclusive desk modes.
 * Primary nav: Portfolio | Watchtower | Research | Discover.
 * Markets (floor), Structure, News, Scanner remain deep-link / internal.
 */

export const DESK_MODE_IDS = [
  "watchlist",
  "watchtower",
  "research",
  "discover",
  "floor",
  "structure",
  "news",
  "scanner",
] as const;

/** Modes shown in the View bar. */
export const DESK_PRIMARY_MODE_IDS = [
  "watchlist",
  "watchtower",
  "research",
  "discover",
] as const;

export type DeskModeId = (typeof DESK_MODE_IDS)[number];
export type DeskPrimaryModeId = (typeof DESK_PRIMARY_MODE_IDS)[number];

/** @deprecated Use DeskModeId */
export type DeskPanelId =
  | DeskModeId
  | "feed"
  | "plan"
  | "risk"
  | "review"
  | "portfolio";

const STORAGE_KEY = "tt-desk-mode-v6";
const LEGACY_V5_KEY = "tt-desk-mode-v5";
const LEGACY_V4_KEY = "tt-desk-mode-v4";
const LEGACY_V3_KEY = "tt-desk-mode-v3";
const LEGACY_V2_KEY = "tt-desk-mode-v2";
const LEGACY_PANELS_KEY = "tt-desk-panels-v1";

/** Investor OS default: Portfolio first. */
export const DEFAULT_DESK_MODE: DeskModeId = "watchlist";

export const DESK_MODE_META: Record<
  DeskModeId,
  { label: string; description: string }
> = {
  watchlist: {
    label: "Portfolio",
    description: "Companies you monitor",
  },
  watchtower: {
    label: "Watchtower",
    description: "Material changes across your portfolio",
  },
  research: {
    label: "Research",
    description: "SEC filings and ticker hub",
  },
  discover: {
    label: "Discover",
    description: "Opportunity rules across the market",
  },
  floor: {
    label: "Markets",
    description: "Movers, wire, and chart (deep link)",
  },
  structure: {
    label: "Structure",
    description: "Dilution and capital risk (deep link)",
  },
  news: {
    label: "News",
    description: "Full catalyst tape",
  },
  scanner: {
    label: "Scanner",
    description: "Advanced ranked list (deep link only)",
  },
};

export const DESK_PANEL_IDS = DESK_MODE_IDS;
export const DESK_PANEL_META = DESK_MODE_META;
export type DeskPanelPrefs = Record<DeskModeId, boolean>;

export const DEFAULT_DESK_PANELS: DeskPanelPrefs = {
  watchlist: true,
  watchtower: false,
  research: false,
  discover: false,
  floor: false,
  structure: false,
  news: false,
  scanner: false,
};

export function isPrimaryDeskMode(mode: DeskModeId): mode is DeskPrimaryModeId {
  return (DESK_PRIMARY_MODE_IDS as readonly string[]).includes(mode);
}

export function toPrimaryDeskMode(mode: DeskModeId): DeskModeId {
  if (isPrimaryDeskMode(mode)) return mode;
  if (mode === "scanner") return "scanner";
  if (mode === "floor" || mode === "news") return "floor";
  if (mode === "structure") return "structure";
  return DEFAULT_DESK_MODE;
}

export function sanitizeDeskMode(raw: unknown): DeskModeId {
  if (raw === "portfolio") return "watchlist";
  if (raw === "markets") return "floor";
  if (raw === "risk") return "structure";
  if (
    typeof raw === "string" &&
    (DESK_MODE_IDS as readonly string[]).includes(raw)
  ) {
    return raw as DeskModeId;
  }
  return DEFAULT_DESK_MODE;
}

export function modeToPanelPrefs(mode: DeskModeId): DeskPanelPrefs {
  return {
    watchlist: mode === "watchlist",
    watchtower: mode === "watchtower",
    research: mode === "research",
    discover: mode === "discover",
    floor: mode === "floor",
    structure: mode === "structure",
    news: mode === "news",
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
  if (
    typeof o.floor === "boolean" ||
    typeof o.news === "boolean" ||
    typeof o.structure === "boolean" ||
    typeof o.research === "boolean" ||
    typeof o.watchlist === "boolean" ||
    typeof o.watchtower === "boolean" ||
    typeof o.discover === "boolean" ||
    typeof o.risk === "boolean"
  ) {
    const mode =
      o.watchlist === true || o.portfolio === true
        ? "watchlist"
        : o.watchtower === true
          ? "watchtower"
          : o.research === true
            ? "research"
            : o.discover === true
              ? "discover"
              : o.structure === true || o.risk === true
                ? "structure"
                : o.floor === true || o.markets === true
                  ? "floor"
                  : o.scanner === true
                    ? "scanner"
                    : o.news === true
                      ? "floor"
                      : DEFAULT_DESK_MODE;
    return modeToPanelPrefs(mode);
  }
  return { ...DEFAULT_DESK_PANELS };
}

export function loadDeskMode(): DeskModeId {
  if (typeof window === "undefined") return DEFAULT_DESK_MODE;
  try {
    const modeRaw = localStorage.getItem(STORAGE_KEY);
    if (modeRaw) {
      const mode = sanitizeDeskMode(JSON.parse(modeRaw));
      return mode === "news" ? "floor" : mode;
    }
    for (const key of [
      LEGACY_V5_KEY,
      LEGACY_V4_KEY,
      LEGACY_V3_KEY,
      LEGACY_V2_KEY,
    ]) {
      const legacyMode = localStorage.getItem(key);
      if (legacyMode) {
        const mode = sanitizeDeskMode(JSON.parse(legacyMode));
        const next = mode === "news" ? "floor" : mode;
        saveDeskMode(next);
        return next;
      }
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

export function modeFromLegacyView(
  view: string | null | undefined
): DeskModeId | null {
  const v = (view ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "portfolio" || v === "watchlist") return "watchlist";
  if (v === "watchtower" || v === "what-changed" || v === "whatchanged") {
    return "watchtower";
  }
  if (v === "research") return "research";
  if (v === "discover") return "discover";
  if (v === "markets" || v === "floor") return "floor";
  if (v === "structure" || v === "risk" || v === "dilution") return "structure";
  if (v === "monitor" || v === "scanner") return "scanner";
  if (v === "feed" || v === "news") return "floor";
  if (v === "plan" || v === "review") return "watchlist";
  return null;
}

export function panelsFromLegacyView(
  view: string | null | undefined
): Partial<DeskPanelPrefs> | null {
  const mode = modeFromLegacyView(view);
  if (!mode) return null;
  return modeToPanelPrefs(mode);
}

/** Map desk mode → ?view= for deep links / URL sync. */
export function viewParamForDeskMode(mode: DeskModeId): string {
  switch (mode) {
    case "watchlist":
      return "portfolio";
    case "watchtower":
      return "watchtower";
    case "research":
      return "research";
    case "discover":
      return "discover";
    case "floor":
    case "news":
      return "markets";
    case "structure":
      return "structure";
    case "scanner":
      return "monitor";
    default:
      return "portfolio";
  }
}
