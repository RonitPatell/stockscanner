import { NextRequest, NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  getAnalogueReportForCatalyst,
  DEFAULT_CRITERIA,
  LOOSE_CRITERIA,
  TIGHT_CRITERIA,
  type AnalogueMatchCriteria,
  type MatchStrictness,
} from "@/lib/analogue";

function parseCriteria(raw: unknown): AnalogueMatchCriteria | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const preset = o.preset;
  if (preset === "loose") return { ...LOOSE_CRITERIA };
  if (preset === "tight") return { ...TIGHT_CRITERIA };
  if (preset === "default") return { ...DEFAULT_CRITERIA };

  const out = { ...DEFAULT_CRITERIA };
  const keys = Object.keys(DEFAULT_CRITERIA) as (keyof AnalogueMatchCriteria)[];
  for (const k of keys) {
    const v = o[k];
    if (v === "exact" || v === "adjacent" || v === "any") {
      out[k] = v as MatchStrictness;
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  const authz = await requirePro();
  if (authz.error) return authz.error;

  const ip = clientIp(req);
  const rl = await rateLimit(
    `analogue:get:${ip}:${authz.user.id}`,
    40,
    60_000
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 40) }
    );
  }

  const catalystId = req.nextUrl.searchParams.get("catalystId");
  if (!catalystId) {
    return NextResponse.json({ error: "catalystId required" }, { status: 400 });
  }

  const preset = req.nextUrl.searchParams.get("preset");
  const criteria = parseCriteria(
    preset ? { preset } : undefined
  );

  const report = await getAnalogueReportForCatalyst({
    catalystId,
    criteria,
    lookbackDays: Math.min(
      365,
      Math.max(30, Number(req.nextUrl.searchParams.get("lookbackDays")) || 180)
    ),
  });

  if ("error" in report) {
    return NextResponse.json(report, { status: 404 });
  }

  // Strip heavy match lists down for default response? Keep top 15 with why
  const slim = {
    ...report,
    matches: report.matches.slice(0, 15).map((m) => ({
      catalystId: m.features.catalystId,
      symbol: m.features.symbol,
      ingestedAt: m.features.ingestedAt,
      category: m.features.category,
      implication: m.features.implication,
      whyComparable: m.whyComparable,
      matchedDimensions: m.matchedDimensions,
      score: m.score,
      mfePct: m.outcome.mfePct,
      maePct: m.outcome.maePct,
      returnM15: m.outcome.returns.m15 ?? null,
    })),
  };

  return NextResponse.json(slim);
}

export async function POST(req: NextRequest) {
  const authz = await requirePro();
  if (authz.error) return authz.error;

  const ip = clientIp(req);
  const rl = await rateLimit(
    `analogue:post:${ip}:${authz.user.id}`,
    30,
    60_000
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 30) }
    );
  }

  const body = await req.json().catch(() => ({}));
  const catalystId = String(body.catalystId ?? "");
  if (!catalystId) {
    return NextResponse.json({ error: "catalystId required" }, { status: 400 });
  }

  const criteria = parseCriteria(body.criteria ?? { preset: body.preset });
  const report = await getAnalogueReportForCatalyst({
    catalystId,
    criteria,
    lookbackDays: Math.min(365, Math.max(30, Number(body.lookbackDays) || 180)),
    limit: Math.min(100, Number(body.limit) || 50),
  });

  if ("error" in report) {
    return NextResponse.json(report, { status: 404 });
  }

  return NextResponse.json({
    ...report,
    matches: report.matches.slice(0, 25).map((m) => ({
      catalystId: m.features.catalystId,
      symbol: m.features.symbol,
      ingestedAt: m.features.ingestedAt,
      category: m.features.category,
      implication: m.features.implication,
      whyComparable: m.whyComparable,
      matchedDimensions: m.matchedDimensions,
      relaxedDimensions: m.relaxedDimensions,
      score: m.score,
      returns: m.outcome.returns,
      mfePct: m.outcome.mfePct,
      maePct: m.outcome.maePct,
    })),
  });
}
