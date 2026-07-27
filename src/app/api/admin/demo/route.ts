import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { getDemoEventCounts, isRedistributionPermitted } from "@/lib/demo";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const [cases, counts, candidates] = await Promise.all([
    prisma.demoCase.findMany({
      orderBy: [{ approved: "desc" }, { publishedAt: "desc" }],
      take: 100,
      select: {
        id: true,
        symbol: true,
        headline: true,
        source: true,
        publishedAt: true,
        approved: true,
        approvedAt: true,
        approvedByEmail: true,
        catalystId: true,
      },
    }),
    getDemoEventCounts(),
    prisma.catalyst.findMany({
      where: {
        publishedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60_000) },
        source: {
          in: ["SEC EDGAR", "GlobeNewswire", "Business Wire", "PR Newswire"],
        },
      },
      orderBy: { publishedAt: "desc" },
      take: 30,
      select: {
        id: true,
        symbol: true,
        headline: true,
        source: true,
        publishedAt: true,
        createdAt: true,
        price: true,
        changePercent: true,
        catalystType: true,
        sourceUrl: true,
      },
    }),
  ]);

  return NextResponse.json({
    cases,
    analytics: counts,
    candidates: candidates.filter((c) => isRedistributionPermitted(c.source)),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: {
    action?: string;
    id?: string;
    catalystId?: string;
    whatHappened?: string;
    whyItMattered?: string;
    trapRisks?: string;
    howItReacted?: string;
    laterCheckpointLabel?: string;
    priceLater?: number | null;
    changeLater?: number | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "approve" && body.id) {
    const updated = await prisma.demoCase.update({
      where: { id: body.id },
      data: {
        approved: true,
        approvedAt: new Date(),
        approvedByEmail: gate.user.email,
      },
      select: { id: true, approved: true },
    });
    return NextResponse.json({ ok: true, case: updated });
  }

  if (body.action === "remove" && body.id) {
    await prisma.demoCase.delete({ where: { id: body.id } });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "unapprove" && body.id) {
    const updated = await prisma.demoCase.update({
      where: { id: body.id },
      data: { approved: false, approvedAt: null, approvedByEmail: null },
      select: { id: true, approved: true },
    });
    return NextResponse.json({ ok: true, case: updated });
  }

  if (body.action === "create_from_catalyst" && body.catalystId) {
    const c = await prisma.catalyst.findUnique({
      where: { id: body.catalystId },
      select: {
        id: true,
        symbol: true,
        headline: true,
        source: true,
        sourceUrl: true,
        publishedAt: true,
        createdAt: true,
        catalystType: true,
        price: true,
        changePercent: true,
        floatShares: true,
        setupTags: true,
        sourceTier: true,
      },
    });
    if (!c) {
      return NextResponse.json({ error: "Catalyst not found" }, { status: 404 });
    }
    if (!isRedistributionPermitted(c.source)) {
      return NextResponse.json(
        { error: "Source not permitted for public curated demo" },
        { status: 400 }
      );
    }

    const evidence: string[] = [];
    if (c.catalystType) evidence.push(`Category: ${c.catalystType}`);
    if (c.sourceTier) evidence.push(`Source tier: ${c.sourceTier}`);
    if (c.floatShares != null) {
      evidence.push(`Float: ${(c.floatShares / 1e6).toFixed(1)}M`);
    }
    if (c.setupTags.length) evidence.push(`Tags: ${c.setupTags.join(", ")}`);

    const created = await prisma.demoCase.create({
      data: {
        catalystId: c.id,
        symbol: c.symbol,
        headline: c.headline.slice(0, 280),
        source: c.source,
        sourceUrl: c.sourceUrl,
        catalystType: c.catalystType,
        publishedAt: c.publishedAt,
        ingestedAt: c.createdAt,
        priceAtIngest: c.price,
        changePercentAtIngest: c.changePercent,
        priceLater: body.priceLater ?? null,
        changeLater: body.changeLater ?? null,
        laterCheckpointLabel: body.laterCheckpointLabel ?? null,
        whatHappened:
          body.whatHappened?.trim() ||
          `${c.symbol}: ${c.headline.slice(0, 180)}`,
        whyItMattered:
          body.whyItMattered?.trim() ||
          "First-party / SEC-style wire can reprice expectations when liquidity is thin.",
        trapRisks:
          body.trapRisks?.trim() ||
          "Verify dilution language, already-extended tape, and whether the move was priced in.",
        howItReacted:
          body.howItReacted?.trim() ||
          (c.changePercent != null
            ? `At ingest: ${c.changePercent >= 0 ? "+" : ""}${c.changePercent.toFixed(1)}%${
                c.price != null ? ` ($${c.price.toFixed(2)})` : ""
              }.`
            : "Price at ingest not recorded."),
        evidence,
        riskFlags: [],
        approved: false,
      },
      select: { id: true, symbol: true, approved: true },
    });

    return NextResponse.json({ ok: true, case: created });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
