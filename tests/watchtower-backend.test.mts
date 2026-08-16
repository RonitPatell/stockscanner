/**
 * Watchtower backend — feed, filters, pagination, read/dismiss, isolation.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  encodeWatchtowerCursor,
  decodeWatchtowerCursor,
  watchtowerFeedQuerySchema,
  watchtowerEventStateBodySchema,
} from "../src/lib/watchtower/index.ts";
import {
  hasTrustTickerAccess,
  resolveAccessState,
} from "../src/lib/subscription.ts";

const NOW = new Date("2026-08-16T12:00:00.000Z");

test("cursor round-trip", () => {
  const enc = encodeWatchtowerCursor({
    occurredAt: "2026-08-01T00:00:00.000Z",
    id: "evt_abc",
  });
  assert.equal(typeof enc, "string");
  assert.deepEqual(decodeWatchtowerCursor(enc), {
    occurredAt: "2026-08-01T00:00:00.000Z",
    id: "evt_abc",
  });
  assert.equal(decodeWatchtowerCursor("!!!"), null);
  assert.equal(decodeWatchtowerCursor(""), null);
});

test("feed query rejects client userId (strict)", () => {
  const parsed = watchtowerFeedQuerySchema.safeParse({
    limit: "10",
    userId: "attacker",
  });
  assert.equal(parsed.success, false);
});

test("state body rejects client userId (strict)", () => {
  const parsed = watchtowerEventStateBodySchema.safeParse({
    read: true,
    userId: "attacker",
  });
  assert.equal(parsed.success, false);
});

test("expired access is not entitled for Watchtower", () => {
  const user = {
    subscriptionStatus: "canceled",
    hasUsedTrial: true,
    trialEndsAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  assert.equal(resolveAccessState(user, NOW), "expired");
  assert.equal(hasTrustTickerAccess(user, NOW), false);
});

test("Watchtower API routes gate with requireTrustTickerAccess", () => {
  const root = join(process.cwd(), "src/app/api/watchtower");
  const files = [
    "route.ts",
    "events/[id]/route.ts",
    "events/state/route.ts",
  ].map((f) => readFileSync(join(root, f), "utf8"));
  for (const src of files) {
    assert.match(src, /requireTrustTickerAccess/);
    assert.doesNotMatch(
      src,
      /body\.userId|query\.userId|searchParams\.get\([\"']userId/
    );
  }
});

test("Watchtower service integration", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL not set");
    return;
  }

  const { prisma } = await import("../src/lib/prisma.ts");
  const {
    getWatchtowerFeed,
    updateWatchtowerEventState,
    listMonitoredSymbolsForUser,
  } = await import("../src/lib/watchtower/service.ts");
  const { watchtowerFeedQuerySchema } = await import(
    "../src/lib/watchtower/schemas.ts"
  );

  const suffix = `wt-${Date.now()}`;
  const owner = await prisma.user.create({
    data: {
      email: `wt-owner-${suffix}@example.com`,
      passwordHash: "test",
      watchlist: [],
    },
  });
  const other = await prisma.user.create({
    data: {
      email: `wt-other-${suffix}@example.com`,
      passwordHash: "test",
      watchlist: [],
    },
  });

  const eventIds: string[] = [];
  const fingerprints: string[] = [];

  async function seedEvent(opts: {
    symbol: string;
    category: string;
    eventType: string;
    severity: string;
    title: string;
    occurredAt: Date;
    fingerprint: string;
    significanceLevel?: string;
  }) {
    fingerprints.push(opts.fingerprint);
    const row = await prisma.companyEvent.create({
      data: {
        symbol: opts.symbol,
        category: opts.category,
        eventType: opts.eventType,
        severity: opts.severity,
        title: opts.title,
        summary: `Summary for ${opts.title}`,
        occurredAt: opts.occurredAt,
        sourceType: "sec",
        sourceId: opts.fingerprint,
        sourceUrl: `https://example.test/${opts.fingerprint}`,
        fingerprint: opts.fingerprint,
        evidenceJson: {
          significance: {
            level: opts.significanceLevel ?? "MEDIUM",
            reasonCodes: ["NEW_SHELF_REGISTRATION"],
            evidence: [
              {
                code: "NEW_SHELF_REGISTRATION",
                detail: "test",
                source: "event_type",
              },
            ],
            engineVersion: "1.0.0",
            thesisRelevance: null,
          },
        },
      },
    });
    eventIds.push(row.id);
    return row;
  }

  try {
    // —— empty portfolio ——
    const emptyQ = watchtowerFeedQuerySchema.parse({ limit: "10" });
    const empty = await getWatchtowerFeed(owner.id, emptyQ);
    assert.equal(empty.ok, true);
    if (empty.ok) {
      assert.equal(empty.result.items.length, 0);
      assert.equal(empty.result.meta.monitoredSymbolCount, 0);
      assert.equal(empty.result.nextCursor, null);
    }

    await prisma.portfolioItem.createMany({
      data: [
        {
          userId: owner.id,
          symbol: "AAPL",
          kind: "watch",
          source: "api",
          sortOrder: 0,
        },
        {
          userId: owner.id,
          symbol: "MSFT",
          kind: "watch",
          source: "api",
          sortOrder: 1,
        },
      ],
    });
    // Other user monitors TSLA only — must not appear for owner
    await prisma.portfolioItem.create({
      data: {
        userId: other.id,
        symbol: "TSLA",
        kind: "watch",
        source: "api",
        sortOrder: 0,
      },
    });

    const monitored = await listMonitoredSymbolsForUser(owner.id);
    assert.deepEqual(monitored, ["AAPL", "MSFT"]);

    const t0 = new Date("2026-08-10T10:00:00.000Z");
    const t1 = new Date("2026-08-11T10:00:00.000Z");
    const t2 = new Date("2026-08-12T10:00:00.000Z");
    const t3 = new Date("2026-08-13T10:00:00.000Z");

    await seedEvent({
      symbol: "AAPL",
      category: "capital",
      eventType: "shelf_registration",
      severity: "material",
      title: "AAPL shelf",
      occurredAt: t1,
      fingerprint: `${suffix}-aapl-shelf`,
      significanceLevel: "MEDIUM",
    });
    await seedEvent({
      symbol: "AAPL",
      category: "management",
      eventType: "management_change",
      severity: "critical",
      title: "AAPL CEO change",
      occurredAt: t3,
      fingerprint: `${suffix}-aapl-mgmt`,
      significanceLevel: "HIGH",
    });
    await seedEvent({
      symbol: "MSFT",
      category: "filing",
      eventType: "sec_10q",
      severity: "notable",
      title: "MSFT 10-Q",
      occurredAt: t2,
      fingerprint: `${suffix}-msft-10q`,
      significanceLevel: "LOW",
    });
    await seedEvent({
      symbol: "TSLA",
      category: "capital",
      eventType: "atm_program",
      severity: "material",
      title: "TSLA ATM (other user only)",
      occurredAt: t3,
      fingerprint: `${suffix}-tsla-atm`,
      significanceLevel: "MEDIUM",
    });
    // Older AAPL for time filter / pagination
    await seedEvent({
      symbol: "AAPL",
      category: "insider",
      eventType: "sec_form4",
      severity: "info",
      title: "AAPL Form 4",
      occurredAt: t0,
      fingerprint: `${suffix}-aapl-f4`,
      significanceLevel: "INFORMATIONAL",
    });

    // —— multiple symbols ——
    const multi = await getWatchtowerFeed(
      owner.id,
      watchtowerFeedQuerySchema.parse({ limit: "50" })
    );
    assert.equal(multi.ok, true);
    if (!multi.ok) return;
    const multiSyms = new Set(multi.result.items.map((i) => i.symbol));
    assert.ok(multiSyms.has("AAPL"));
    assert.ok(multiSyms.has("MSFT"));
    assert.equal(multiSyms.has("TSLA"), false);
    assert.equal(multi.result.items.length, 4);
    // Newest first
    assert.equal(multi.result.items[0]!.title, "AAPL CEO change");
    assert.ok(multi.result.items[0]!.significance.reasonCodes.length > 0);
    assert.equal(multi.result.items[0]!.thesisRelevance, null);
    assert.equal(multi.result.items[0]!.readState.isRead, false);

    // —— category filter ——
    const capitalOnly = await getWatchtowerFeed(
      owner.id,
      watchtowerFeedQuerySchema.parse({ category: "capital", limit: "20" })
    );
    assert.equal(capitalOnly.ok, true);
    if (capitalOnly.ok) {
      assert.equal(capitalOnly.result.items.length, 1);
      assert.equal(capitalOnly.result.items[0]!.category, "capital");
      assert.equal(capitalOnly.result.items[0]!.symbol, "AAPL");
    }

    // —— severity filter ——
    const critical = await getWatchtowerFeed(
      owner.id,
      watchtowerFeedQuerySchema.parse({ severity: "critical", limit: "20" })
    );
    assert.equal(critical.ok, true);
    if (critical.ok) {
      assert.equal(critical.result.items.length, 1);
      assert.equal(critical.result.items[0]!.severity, "critical");
    }

    const highSig = await getWatchtowerFeed(
      owner.id,
      watchtowerFeedQuerySchema.parse({
        significance: "HIGH",
        limit: "20",
      })
    );
    assert.equal(highSig.ok, true);
    if (highSig.ok) {
      assert.equal(highSig.result.items.length, 1);
      assert.equal(highSig.result.items[0]!.severity, "critical");
    }

    // —— symbol filter (subset of portfolio) ——
    const msftOnly = await getWatchtowerFeed(
      owner.id,
      watchtowerFeedQuerySchema.parse({ symbol: "MSFT", limit: "20" })
    );
    assert.equal(msftOnly.ok, true);
    if (msftOnly.ok) {
      assert.equal(msftOnly.result.items.length, 1);
      assert.equal(msftOnly.result.items[0]!.symbol, "MSFT");
    }

    // Asking for TSLA while not monitoring → empty (no leak)
    const tslaAsk = await getWatchtowerFeed(
      owner.id,
      watchtowerFeedQuerySchema.parse({ symbol: "TSLA", limit: "20" })
    );
    assert.equal(tslaAsk.ok, true);
    if (tslaAsk.ok) assert.equal(tslaAsk.result.items.length, 0);

    // —— pagination ——
    const page1 = await getWatchtowerFeed(
      owner.id,
      watchtowerFeedQuerySchema.parse({ limit: "2" })
    );
    assert.equal(page1.ok, true);
    if (!page1.ok) return;
    assert.equal(page1.result.items.length, 2);
    assert.ok(page1.result.nextCursor);

    const page2 = await getWatchtowerFeed(
      owner.id,
      watchtowerFeedQuerySchema.parse({
        limit: "2",
        cursor: page1.result.nextCursor!,
      })
    );
    assert.equal(page2.ok, true);
    if (!page2.ok) return;
    assert.equal(page2.result.items.length, 2);
    const pageIds = new Set([
      ...page1.result.items.map((i) => i.id),
      ...page2.result.items.map((i) => i.id),
    ]);
    assert.equal(pageIds.size, 4);

    // —— read state ——
    const targetId = page1.result.items[0]!.id;
    const marked = await updateWatchtowerEventState(owner.id, targetId, {
      read: true,
    });
    assert.equal(marked.ok, true);
    if (marked.ok) {
      assert.equal(marked.readState.isRead, true);
      assert.ok(marked.readState.readAt);
    }

    const unread = await getWatchtowerFeed(
      owner.id,
      watchtowerFeedQuerySchema.parse({ unreadOnly: "true", limit: "50" })
    );
    assert.equal(unread.ok, true);
    if (unread.ok) {
      assert.equal(
        unread.result.items.some((i) => i.id === targetId),
        false
      );
      assert.equal(unread.result.items.length, 3);
    }

    const afterRead = await getWatchtowerFeed(
      owner.id,
      watchtowerFeedQuerySchema.parse({ limit: "50" })
    );
    assert.equal(afterRead.ok, true);
    if (afterRead.ok) {
      const row = afterRead.result.items.find((i) => i.id === targetId);
      assert.ok(row);
      assert.equal(row!.readState.isRead, true);
    }

    // —— dismiss / hide ——
    const dismissed = await updateWatchtowerEventState(owner.id, targetId, {
      dismissed: true,
    });
    assert.equal(dismissed.ok, true);

    const defaultFeed = await getWatchtowerFeed(
      owner.id,
      watchtowerFeedQuerySchema.parse({ limit: "50" })
    );
    assert.equal(defaultFeed.ok, true);
    if (defaultFeed.ok) {
      assert.equal(
        defaultFeed.result.items.some((i) => i.id === targetId),
        false
      );
    }

    const withDismissed = await getWatchtowerFeed(
      owner.id,
      watchtowerFeedQuerySchema.parse({
        includeDismissed: "true",
        limit: "50",
      })
    );
    assert.equal(withDismissed.ok, true);
    if (withDismissed.ok) {
      const row = withDismissed.result.items.find((i) => i.id === targetId);
      assert.ok(row);
      assert.equal(row!.readState.isDismissed, true);
    }

    // —— cross-user isolation ——
    // Other user must not see owner's read/dismiss; their feed for TSLA only
    const otherFeed = await getWatchtowerFeed(
      other.id,
      watchtowerFeedQuerySchema.parse({
        includeDismissed: "true",
        limit: "50",
      })
    );
    assert.equal(otherFeed.ok, true);
    if (otherFeed.ok) {
      assert.equal(otherFeed.result.items.length, 1);
      assert.equal(otherFeed.result.items[0]!.symbol, "TSLA");
      assert.equal(otherFeed.result.items[0]!.readState.isRead, false);
      assert.equal(otherFeed.result.items[0]!.readState.isDismissed, false);
    }

    // Other cannot mutate owner's event state
    const idor = await updateWatchtowerEventState(other.id, targetId, {
      read: true,
    });
    assert.equal(idor.ok, false);
    if (!idor.ok) assert.equal(idor.code, "NOT_MONITORED");

    const ownerState = await prisma.userCompanyEventState.findUnique({
      where: {
        userId_companyEventId: {
          userId: owner.id,
          companyEventId: targetId,
        },
      },
    });
    assert.ok(ownerState?.dismissedAt);
    const otherState = await prisma.userCompanyEventState.findUnique({
      where: {
        userId_companyEventId: {
          userId: other.id,
          companyEventId: targetId,
        },
      },
    });
    assert.equal(otherState, null);

    // —— duplicate events (fingerprint unique → single feed row) ——
    const dupFp = `${suffix}-dup`;
    await prisma.companyEvent.create({
      data: {
        symbol: "AAPL",
        category: "filing",
        eventType: "sec_8k",
        severity: "notable",
        title: "Dup event",
        occurredAt: new Date("2026-08-14T10:00:00.000Z"),
        sourceType: "sec",
        fingerprint: dupFp,
        evidenceJson: {},
      },
    });
    fingerprints.push(dupFp);
    let dupFailed = false;
    try {
      await prisma.companyEvent.create({
        data: {
          symbol: "AAPL",
          category: "filing",
          eventType: "sec_8k",
          severity: "notable",
          title: "Dup event retry",
          occurredAt: new Date("2026-08-14T10:00:00.000Z"),
          sourceType: "sec",
          fingerprint: dupFp,
          evidenceJson: {},
        },
      });
    } catch {
      dupFailed = true;
    }
    assert.equal(dupFailed, true);

    const afterDup = await getWatchtowerFeed(
      owner.id,
      watchtowerFeedQuerySchema.parse({
        includeDismissed: "true",
        limit: "50",
      })
    );
    assert.equal(afterDup.ok, true);
    if (afterDup.ok) {
      const dups = afterDup.result.items.filter((i) => i.title === "Dup event");
      assert.equal(dups.length, 1);
    }
  } finally {
    await prisma.userCompanyEventState.deleteMany({
      where: { userId: { in: [owner.id, other.id] } },
    });
    if (fingerprints.length) {
      await prisma.companyEvent.deleteMany({
        where: { fingerprint: { in: fingerprints } },
      });
    }
    await prisma.portfolioItem.deleteMany({
      where: { userId: { in: [owner.id, other.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [owner.id, other.id] } },
    });
  }
});
