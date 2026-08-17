import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hasTrustTickerAccess } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { ensureCompanyReady, productionReadyPorts } from "@/lib/company-readiness";
import { trackRetention } from "@/lib/analytics/retention";
import { normalizeSymbol, isUsTickerSymbol } from "@/lib/company-identity";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ symbol: string }> };

/**
 * GET /api/research/[symbol]/readiness
 * Entitled sessions may enqueue hydration. Public / expired: inspect only.
 * Never live-fetches SEC from this handler except identity mapping when CIK is missing.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { symbol: raw } = await ctx.params;
  const symbol = normalizeSymbol(raw);
  if (!symbol || !isUsTickerSymbol(symbol)) {
    return NextResponse.json(
      { error: "Invalid symbol", code: "INVALID" },
      { status: 400 }
    );
  }

  const ip = clientIp(req);
  const session = await auth();
  const userId = session?.user?.id ?? null;

  let entitled = false;
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        cancelAtPeriodEnd: true,
        trialEndsAt: true,
        hasUsedTrial: true,
        trialConsumedAt: true,
        trialStartedAt: true,
      },
    });
    entitled = Boolean(user && hasTrustTickerAccess(user));
  }

  const rlKey = entitled
    ? `research:ready:${userId}`
    : `research:ready:ip:${ip}`;
  const limit = entitled ? 40 : 20;
  const rl = await rateLimit(rlKey, limit, 60_000, { strict: true });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, limit) }
    );
  }

  if (entitled) {
    const hourly = await rateLimit(`research:hydrate:${userId}`, 20, 3600_000, {
      strict: true,
    });
    if (!hourly.ok) {
      const readiness = await ensureCompanyReady(symbol, {
        ports: productionReadyPorts(),
        enqueue: false,
        ensureCoverage: false,
        userId,
      });
      return NextResponse.json({
        readiness,
        hydrationLimited: true,
      });
    }
  }

  try {
    const readiness = await ensureCompanyReady(symbol, {
      ports: productionReadyPorts(),
      enqueue: entitled,
      ensureCoverage: entitled,
      userId: entitled ? userId : null,
    });
    if (entitled) {
      void trackRetention("company_searched", {
        userId,
        props: {
          symbol,
          financials: readiness.financials,
        },
      });
      if (readiness.financials === "READY") {
        void trackRetention("research_return_visit", {
          userId,
          props: { symbol },
        });
      }
    }
    return NextResponse.json({ readiness });
  } catch {
    return NextResponse.json(
      { error: "Could not load readiness", code: "ERROR" },
      { status: 500 }
    );
  }
}
