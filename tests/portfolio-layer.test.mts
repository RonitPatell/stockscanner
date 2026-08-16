/**
 * Monitored portfolio layer — schemas + service ownership tests.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  addPortfolioBodySchema,
  updatePortfolioBodySchema,
  portfolioSymbolSchema,
} from "../src/lib/portfolio/schemas.ts";
import { normalizePortfolioSymbol } from "../src/lib/portfolio/symbols.ts";
import {
  hasTrustTickerAccess,
  resolveAccessState,
} from "../src/lib/subscription.ts";

const NOW = new Date("2026-08-16T12:00:00.000Z");

test("lowercase ticker normalization", () => {
  assert.equal(normalizePortfolioSymbol("aapl"), "AAPL");
  const parsed = portfolioSymbolSchema.safeParse(" msft ");
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data, "MSFT");
});

test("invalid ticker rejected", () => {
  assert.equal(normalizePortfolioSymbol("BRK.B"), null);
  assert.equal(normalizePortfolioSymbol(""), null);
  assert.equal(normalizePortfolioSymbol("TOOLONG"), null);
  assert.equal(portfolioSymbolSchema.safeParse("!!!").success, false);
  assert.equal(portfolioSymbolSchema.safeParse("").success, false);
});

test("add body rejects client userId (strict)", () => {
  const parsed = addPortfolioBodySchema.safeParse({
    symbol: "AAPL",
    userId: "attacker-user-id",
  });
  assert.equal(parsed.success, false);
});

test("update body rejects client userId (strict)", () => {
  const parsed = updatePortfolioBodySchema.safeParse({
    label: "x",
    userId: "attacker-user-id",
  });
  assert.equal(parsed.success, false);
});

test("expired subscriber is not entitled for portfolio APIs", () => {
  const user = {
    subscriptionStatus: "canceled",
    hasUsedTrial: true,
    trialEndsAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  assert.equal(resolveAccessState(user, NOW), "expired");
  assert.equal(hasTrustTickerAccess(user, NOW), false);
});

test("entitled trial user can call portfolio APIs", () => {
  const user = {
    subscriptionStatus: "trialing",
    subscriptionEndsAt: new Date("2026-08-20T12:00:00.000Z"),
    hasUsedTrial: true,
    trialEndsAt: new Date("2026-08-20T12:00:00.000Z"),
  };
  assert.equal(resolveAccessState(user, NOW), "trialing");
  assert.equal(hasTrustTickerAccess(user, NOW), true);
});

test("portfolio API routes gate with requireTrustTickerAccess and no client userId", () => {
  const root = join(process.cwd(), "src/app/api/portfolio");
  const files = [
    "route.ts",
    "[id]/route.ts",
    "search/route.ts",
  ].map((f) => readFileSync(join(root, f), "utf8"));
  for (const src of files) {
    assert.match(src, /requireTrustTickerAccess/);
    assert.doesNotMatch(src, /body\.userId|query\.userId|searchParams\.get\([\"']userId/);
  }
  const idRoute = files[1]!;
  assert.match(idRoute, /gate\.user\.id/);
});

test("portfolio service: duplicate / remove / IDOR", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL not set");
    return;
  }

  const { prisma } = await import("../src/lib/prisma.ts");
  const {
    addPortfolioForUser,
    removePortfolioForUser,
    listPortfolioForUser,
  } = await import("../src/lib/portfolio/service.ts");

  const suffix = `pf-${Date.now()}`;
  const owner = await prisma.user.create({
    data: {
      email: `owner-${suffix}@example.com`,
      passwordHash: "test",
      watchlist: [],
    },
  });
  const other = await prisma.user.create({
    data: {
      email: `other-${suffix}@example.com`,
      passwordHash: "test",
      watchlist: [],
    },
  });

  try {
    const add1 = await addPortfolioForUser(owner.id, {
      symbol: "AAPL",
      label: "Core",
      note: null,
      notes: null,
      entryPrice: 100,
      kind: "watch",
    });
    assert.equal(add1.ok, true);
    if (!add1.ok) return;

    const addDup = await addPortfolioForUser(owner.id, {
      symbol: "aapl",
      label: null,
      note: null,
      notes: null,
      entryPrice: null,
      kind: "watch",
    });
    assert.equal(addDup.ok, false);
    if (!addDup.ok) assert.equal(addDup.code, "DUPLICATE");

    const listed = await listPortfolioForUser(owner.id);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]!.symbol, "AAPL");
    assert.equal(listed[0]!.label, "Core");
    assert.equal(listed[0]!.entryPrice, 100);

    const idor = await removePortfolioForUser(other.id, add1.item.id);
    assert.equal(idor.ok, false);
    if (!idor.ok) assert.equal(idor.code, "NOT_FOUND");

    const stillThere = await prisma.portfolioItem.findUnique({
      where: { id: add1.item.id },
    });
    assert.ok(stillThere);

    const removed = await removePortfolioForUser(owner.id, add1.item.id);
    assert.equal(removed.ok, true);

    const after = await listPortfolioForUser(owner.id);
    assert.equal(after.length, 0);

    const ownerRow = await prisma.user.findUnique({
      where: { id: owner.id },
      select: { watchlist: true },
    });
    assert.deepEqual(ownerRow?.watchlist ?? [], []);
  } finally {
    await prisma.portfolioItem.deleteMany({
      where: { userId: { in: [owner.id, other.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [owner.id, other.id] } },
    });
  }
});
