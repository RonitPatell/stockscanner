import {
  DEFAULT_SQUAWK_SETTINGS,
  type SquawkPriorityLevel,
  type SquawkSettings,
} from "./types.ts";

export const SQUAWK_SETTINGS_KEY = "tt-squawk-settings-v1";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function normalizeSquawkSettings(raw: unknown): SquawkSettings {
  const base = { ...DEFAULT_SQUAWK_SETTINGS };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const voice =
    o.voice && typeof o.voice === "object"
      ? (o.voice as Record<string, unknown>)
      : {};
  const qh =
    o.quietHours && typeof o.quietHours === "object"
      ? (o.quietHours as Record<string, unknown>)
      : {};

  const minPriority = (["low", "normal", "high", "critical"] as const).includes(
    o.minPriority as SquawkPriorityLevel
  )
    ? (o.minPriority as SquawkPriorityLevel)
    : base.minPriority;

  return {
    enabled: o.enabled === true,
    watchlistOnly: o.watchlistOnly === true,
    riskOnly: o.riskOnly === true,
    minPriority,
    muted: o.muted === true,
    quietHours: {
      enabled: qh.enabled === true,
      startMin: clamp(Number(qh.startMin ?? base.quietHours.startMin), 0, 1439),
      endMin: clamp(Number(qh.endMin ?? base.quietHours.endMin), 0, 1439),
    },
    voice: {
      voiceURI: typeof voice.voiceURI === "string" ? voice.voiceURI : null,
      rate: clamp(Number(voice.rate ?? base.voice.rate), 0.5, 2),
      pitch: clamp(Number(voice.pitch ?? base.voice.pitch), 0, 2),
      volume: clamp(Number(voice.volume ?? base.voice.volume), 0, 1),
    },
  };
}

export function loadSquawkSettings(): SquawkSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SQUAWK_SETTINGS };
  try {
    const raw = localStorage.getItem(SQUAWK_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SQUAWK_SETTINGS };
    return normalizeSquawkSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SQUAWK_SETTINGS };
  }
}

export function saveSquawkSettings(settings: SquawkSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SQUAWK_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
