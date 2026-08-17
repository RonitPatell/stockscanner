import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPANY_EVENT_CATEGORIES,
  COMPANY_EVENT_TYPES,
  companyEventFingerprint,
  isCompanyEventCategory,
  isCompanyEventType,
} from "../src/lib/company-events/types.ts";
import {
  isThesisConditionType,
  THESIS_CONDITION_TYPES,
} from "../src/lib/thesis/types.ts";
import { normalizePortfolioSymbol } from "../src/lib/portfolio/symbols.ts";

test("company event categories cover required V2 set", () => {
  for (const c of [
    "filing",
    "financial",
    "capital",
    "insider",
    "management",
    "governance",
    "ownership",
    "guidance",
    "corporate",
  ]) {
    assert.equal(isCompanyEventCategory(c), true);
  }
  assert.equal(isCompanyEventCategory("advice"), false);
  assert.ok(COMPANY_EVENT_CATEGORIES.length >= 9);
});

test("company event types are centrally registered", () => {
  assert.ok(COMPANY_EVENT_TYPES.includes("sec_form4"));
  assert.ok(COMPANY_EVENT_TYPES.includes("shelf_registration"));
  assert.ok(COMPANY_EVENT_TYPES.includes("institutional_13f_update"));
  assert.equal(isCompanyEventType("buy_now"), false);
});

test("fingerprint is stable for identical inputs", () => {
  const occurredAt = new Date("2026-08-01T15:00:00.000Z");
  const a = companyEventFingerprint({
    symbol: "abc",
    eventType: "sec_8k",
    sourceType: "sec",
    sourceId: "0001234567-26-000001",
    occurredAt,
    title: "Entry into Material Agreement",
  });
  const b = companyEventFingerprint({
    symbol: "ABC",
    eventType: "sec_8k",
    sourceType: "sec",
    sourceId: "0001234567-26-000001",
    occurredAt,
    title: "Entry into Material Agreement",
  });
  assert.equal(a, b);
  assert.match(a, /^ABC\|sec_8k\|sec\|/);
});

test("thesis condition types reject advice-shaped ids", () => {
  assert.ok(THESIS_CONDITION_TYPES.includes("NO_EVENT_TYPE"));
  assert.ok(THESIS_CONDITION_TYPES.includes("CUSTOM_MANUAL"));
  assert.equal(isThesisConditionType("recommend_buy"), false);
  assert.equal(isThesisConditionType("no_new_shelf"), false);
});

test("normalizePortfolioSymbol accepts A–Z 1–5 only", () => {
  assert.equal(normalizePortfolioSymbol(" aapl "), "AAPL");
  assert.equal(normalizePortfolioSymbol("TOOLONG"), null);
  assert.equal(normalizePortfolioSymbol("BRK.B"), null);
});

/**
 * Live DB checks — skip without DATABASE_URL.
 * Covers idempotent CompanyEvent insert, portfolio unique, and portfolio↔event join shape.
 */
test("v2 foundation db: idempotent events + portfolio join", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL not set");
    return;
  }

  const { prisma } = await import("../src/lib/prisma.ts");
  const suffix = `v2f-${Date.now()}`;
  const email = `v2-foundation-${suffix}@example.com`;

  const user = await prisma.user.create({
    data: {
      email,
      watchlist: ["AAPL", "MSFT"],
      passwordHash: "test-not-used",
    },
  });

  try {
    const symbols = ["AAPL", "MSFT"] as const;
    for (let i = 0; i < symbols.length; i++) {
      await prisma.portfolioItem.upsert({
        where: {
          userId_symbol: { userId: user.id, symbol: symbols[i]! },
        },
        create: {
          userId: user.id,
          symbol: symbols[i]!,
          kind: "watch",
          sortOrder: i,
          source: "watchlist_migration",
        },
        update: { archivedAt: null, sortOrder: i },
      });
    }
    // Idempotent re-upsert
    await prisma.portfolioItem.upsert({
      where: { userId_symbol: { userId: user.id, symbol: "AAPL" } },
      create: {
        userId: user.id,
        symbol: "AAPL",
        kind: "watch",
        source: "watchlist_migration",
      },
      update: { archivedAt: null },
    });

    const items = await prisma.portfolioItem.findMany({
      where: { userId: user.id },
    });
    assert.equal(items.length, 2);

    const occurredAt = new Date("2026-08-10T12:00:00.000Z");
    const fingerprint = companyEventFingerprint({
      symbol: "AAPL",
      eventType: "sec_8k",
      sourceType: "sec",
      sourceId: `acc-${suffix}`,
      occurredAt,
      title: "Test 8-K",
    });

    const eventData = {
      symbol: "AAPL",
      category: "filing",
      eventType: "sec_8k",
      severity: "notable",
      title: "Test 8-K",
      summary: "Factual test summary",
      occurredAt,
      sourceType: "sec",
      sourceId: `acc-${suffix}`,
      fingerprint,
      evidenceJson: { accession: `acc-${suffix}` },
    };

    await prisma.companyEvent.create({ data: eventData });
    await assert.rejects(
      () => prisma.companyEvent.create({ data: eventData }),
      /Unique constraint|P2002/i
    );

    // Portfolio-scoped event query (Watchtower shape)
    const portfolioSymbols = items.map((i) => i.symbol);
    const feed = await prisma.companyEvent.findMany({
      where: {
        symbol: { in: portfolioSymbols },
        occurredAt: { gte: new Date("2026-08-01T00:00:00.000Z") },
      },
      orderBy: { occurredAt: "desc" },
    });
    assert.ok(feed.some((e) => e.fingerprint === fingerprint));

    // Private read state
    const ev = feed.find((e) => e.fingerprint === fingerprint)!;
    await prisma.userCompanyEventState.create({
      data: {
        userId: user.id,
        companyEventId: ev.id,
        readAt: new Date(),
      },
    });
    await assert.rejects(
      () =>
        prisma.userCompanyEventState.create({
          data: {
            userId: user.id,
            companyEventId: ev.id,
          },
        }),
      /Unique constraint|P2002/i
    );

    // MetricObservation UNKNOWN stays null
    await prisma.metricObservation.create({
      data: {
        symbol: "AAPL",
        metricKey: "cash",
        value: null,
        sourceType: "sec",
        fingerprint: `metric-${suffix}`,
        confidence: "unknown",
      },
    });
    const metric = await prisma.metricObservation.findUnique({
      where: { fingerprint: `metric-${suffix}` },
    });
    assert.equal(metric!.value, null);

    // Thesis private ownership
    const thesis = await prisma.investmentThesis.create({
      data: {
        userId: user.id,
        symbol: "AAPL",
        premise: "User-authored monitoring premise",
        conditions: {
          create: [
            {
              conditionType: "NO_EVENT_TYPE",
              label: "No new shelf registration",
              polarity: "invalidate_if",
              paramsJson: { eventType: "shelf_registration" },
            },
          ],
        },
      },
      include: { conditions: true },
    });
    assert.equal(thesis.conditions.length, 1);
  } finally {
    await prisma.userCompanyEventState.deleteMany({ where: { userId: user.id } });
    await prisma.investmentThesis.deleteMany({ where: { userId: user.id } });
    await prisma.portfolioItem.deleteMany({ where: { userId: user.id } });
    await prisma.companyEvent.deleteMany({
      where: { fingerprint: { contains: suffix } },
    });
    await prisma.metricObservation.deleteMany({
      where: { fingerprint: { contains: suffix } },
    });
    // Also delete by sourceId pattern if fingerprint cleanup missed
    await prisma.companyEvent.deleteMany({
      where: { sourceId: `acc-${suffix}` },
    });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
