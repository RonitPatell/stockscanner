/**
 * Session-scoped Monitor UI preferences.
 * Ownership always from session.user.id — never client-provided userId.
 *
 * Uses raw SQL so a stale Prisma client (missing monitorUiPrefs in the
 * generated select enum) cannot throw on every dashboard SSR.
 */

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_MONITOR_UI_PREFS,
  type MonitorDisplayDensity,
  type MonitorUiPreferences,
} from "./types";

const DENSITIES = new Set<MonitorDisplayDensity>([
  "compact",
  "comfortable",
  "dense",
]);

export function sanitizeMonitorUiPrefs(raw: unknown): MonitorUiPreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_MONITOR_UI_PREFS };
  const o = raw as Record<string, unknown>;
  const density = o.displayDensity;
  const pinned =
    typeof o.pinnedTicker === "string" && /^[A-Za-z]{1,5}$/.test(o.pinnedTicker)
      ? o.pinnedTicker.toUpperCase()
      : null;
  const preset =
    typeof o.activePresetId === "string" && o.activePresetId.length <= 80
      ? o.activePresetId
      : null;
  return {
    activePresetId: preset,
    pinnedTicker: pinned,
    displayDensity:
      typeof density === "string" && DENSITIES.has(density as MonitorDisplayDensity)
        ? (density as MonitorDisplayDensity)
        : DEFAULT_MONITOR_UI_PREFS.displayDensity,
    squawkEnabled: o.squawkEnabled !== false,
  };
}

/**
 * Load lightweight prefs for the authenticated user only.
 * Does not load alertStrategies / full strategy JSON.
 */
export async function loadMonitorUiPreferencesForUser(
  userId: string
): Promise<MonitorUiPreferences> {
  if (!userId) return { ...DEFAULT_MONITOR_UI_PREFS };
  try {
    const rows = await prisma.$queryRaw<Array<{ prefs: unknown }>>`
      SELECT "monitorUiPrefs" AS prefs
      FROM "User"
      WHERE id = ${userId}
      LIMIT 1
    `;
    return sanitizeMonitorUiPrefs(rows[0]?.prefs ?? null);
  } catch {
    return { ...DEFAULT_MONITOR_UI_PREFS };
  }
}

export async function saveMonitorUiPreferencesForUser(
  userId: string,
  patch: Partial<MonitorUiPreferences>
): Promise<MonitorUiPreferences> {
  const current = await loadMonitorUiPreferencesForUser(userId);
  const next = sanitizeMonitorUiPrefs({ ...current, ...patch });
  const payload = JSON.stringify(next);
  try {
    await prisma.$executeRaw`
      UPDATE "User"
      SET "monitorUiPrefs" = CAST(${payload} AS JSONB)
      WHERE id = ${userId}
    `;
  } catch {
    try {
      await prisma.$executeRaw`
        UPDATE "User"
        SET "monitorUiPrefs" = CAST(${payload} AS JSON)
        WHERE id = ${userId}
      `;
    } catch {
      /* prefs are non-critical chrome */
    }
  }
  return next;
}
