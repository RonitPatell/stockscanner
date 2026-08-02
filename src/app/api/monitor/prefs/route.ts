import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  loadMonitorUiPreferencesForUser,
  saveMonitorUiPreferencesForUser,
  sanitizeMonitorUiPrefs,
} from "@/lib/monitor/ssr";

export const dynamic = "force-dynamic";

/** Lightweight Monitor prefs for the session user only. */
export async function GET(req: NextRequest) {
  const gate = await requireUser();
  if (gate.error) return gate.error;

  const rl = await rateLimit(
    `monitor-prefs-get:${gate.user.id}:${clientIp(req)}`,
    60,
    60_000,
    { strict: true }
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  const prefs = await loadMonitorUiPreferencesForUser(gate.user.id);
  return NextResponse.json({ prefs });
}

/**
 * PATCH permitted lightweight fields only.
 * Never accepts client userId; never writes full strategy JSON here.
 */
export async function PATCH(req: NextRequest) {
  const gate = await requireUser();
  if (gate.error) return gate.error;

  const rl = await rateLimit(
    `monitor-prefs-patch:${gate.user.id}:${clientIp(req)}`,
    30,
    60_000,
    { strict: true }
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const allowed = sanitizeMonitorUiPrefs({
    activePresetId: body.activePresetId,
    pinnedTicker: body.pinnedTicker,
    displayDensity: body.displayDensity,
    squawkEnabled: body.squawkEnabled,
  });

  const prefs = await saveMonitorUiPreferencesForUser(gate.user.id, allowed);
  return NextResponse.json({ prefs });
}
