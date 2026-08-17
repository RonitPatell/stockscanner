/**
 * Thesis Monitoring — Zod validation, CRUD, IDOR isolation.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createThesisBodySchema,
  thesisConditionInputSchema,
  updateConditionBodySchema,
  updateThesisBodySchema,
  reorderConditionsBodySchema,
} from "../src/lib/thesis/schemas.ts";
import {
  THESIS_CONDITION_TYPES,
  isAutomatedConditionType,
} from "../src/lib/thesis/types.ts";
import {
  hasTrustTickerAccess,
  resolveAccessState,
} from "../src/lib/subscription.ts";

const NOW = new Date("2026-08-16T12:00:00.000Z");

test("condition type registry is complete and non-executable", () => {
  assert.deepEqual([...THESIS_CONDITION_TYPES], [
    "METRIC_ABOVE",
    "METRIC_BELOW",
    "METRIC_GROWTH_ABOVE",
    "METRIC_GROWTH_BELOW",
    "NO_EVENT_TYPE",
    "EVENT_TYPE_OCCURRED",
    "SHARE_COUNT_CHANGE_BELOW",
    "CAPITAL_RISK_NOT_ABOVE",
    "CASH_RUNWAY_ABOVE",
    "CUSTOM_MANUAL",
  ]);
  assert.equal(isAutomatedConditionType("CUSTOM_MANUAL"), false);
  assert.equal(isAutomatedConditionType("METRIC_ABOVE"), true);
});

test("example conditions validate", () => {
  const cases = [
    {
      conditionType: "METRIC_GROWTH_ABOVE",
      label: "Revenue YoY growth stays above 25%",
      params: {
        metricKey: "revenue",
        thresholdPercent: 25,
        period: "yoy",
      },
    },
    {
      conditionType: "METRIC_ABOVE",
      label: "Gross margin stays above 30%",
      params: { metricKey: "gross_margin", threshold: 30 },
    },
    {
      conditionType: "SHARE_COUNT_CHANGE_BELOW",
      label: "Share count growth stays below 10% YoY",
      params: { thresholdPercent: 10, period: "yoy" },
    },
    {
      conditionType: "CAPITAL_RISK_NOT_ABOVE",
      label: "Capital Risk never becomes Elevated",
      params: { maxStatus: "moderate" },
    },
    {
      conditionType: "NO_EVENT_TYPE",
      label: "No new ATM event",
      params: { eventType: "atm_program" },
    },
    {
      conditionType: "CASH_RUNWAY_ABOVE",
      label: "Cash runway stays above 4 quarters",
      params: { quarters: 4 },
    },
    {
      conditionType: "CUSTOM_MANUAL",
      label: "Management execution remains credible",
      params: { text: "Qualitative judgment — not auto-verified." },
    },
  ] as const;

  for (const c of cases) {
    const parsed = thesisConditionInputSchema.safeParse(c);
    assert.equal(parsed.success, true, JSON.stringify(c));
  }
});

test("rejects arbitrary formulas and bad params", () => {
  assert.equal(
    thesisConditionInputSchema.safeParse({
      conditionType: "METRIC_ABOVE",
      label: "hack",
      params: { metricKey: "revenue", threshold: 1, formula: "x*2" },
    }).success,
    false
  );
  assert.equal(
    thesisConditionInputSchema.safeParse({
      conditionType: "METRIC_ABOVE",
      label: "bad metric",
      params: { metricKey: "made_up_metric", threshold: 1 },
    }).success,
    false
  );
  assert.equal(
    thesisConditionInputSchema.safeParse({
      conditionType: "CUSTOM_MANUAL",
      label: "empty",
      params: { text: "" },
    }).success,
    false
  );
  assert.equal(
    createThesisBodySchema.safeParse({
      symbol: "AAPL",
      userId: "attacker",
    }).success,
    false
  );
  assert.equal(
    updateThesisBodySchema.safeParse({
      title: "x",
      userId: "attacker",
    }).success,
    false
  );
});

test("expired access is not entitled", () => {
  const user = {
    subscriptionStatus: "canceled",
    hasUsedTrial: true,
    trialEndsAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  assert.equal(resolveAccessState(user, NOW), "expired");
  assert.equal(hasTrustTickerAccess(user, NOW), false);
});

test("thesis API routes gate entitlement and avoid client userId", () => {
  const root = join(process.cwd(), "src/app/api/thesis");
  const files = [
    "route.ts",
    "[id]/route.ts",
    "[id]/conditions/route.ts",
    "[id]/conditions/[conditionId]/route.ts",
    "[id]/conditions/reorder/route.ts",
  ].map((f) => readFileSync(join(root, f), "utf8"));
  for (const src of files) {
    assert.match(src, /requireTrustTickerAccess/);
    assert.doesNotMatch(
      src,
      /body\.userId|query\.userId|searchParams\.get\([\"']userId/
    );
  }
});

test("manual conditions never claim automated state in service DTO", async () => {
  // Static: evaluationForType behavior via create+read when DB available;
  // always assert type helper contract here.
  assert.equal(isAutomatedConditionType("CUSTOM_MANUAL"), false);
  const updateEmpty = updateConditionBodySchema.safeParse({});
  assert.equal(updateEmpty.success, false);
  const reorder = reorderConditionsBodySchema.safeParse({
    orderedIds: ["a", "b"],
  });
  assert.equal(reorder.success, true);
});

test("thesis service CRUD + IDOR", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL not set");
    return;
  }

  const { prisma } = await import("../src/lib/prisma.ts");
  const {
    createThesisForUser,
    getThesisForUser,
    updateThesisForUser,
    deleteThesisForUser,
    addConditionForUser,
    updateConditionForUser,
    deleteConditionForUser,
    reorderConditionsForUser,
    listThesesForUser,
  } = await import("../src/lib/thesis/service.ts");

  const suffix = `th-${Date.now()}`;
  const owner = await prisma.user.create({
    data: {
      email: `th-owner-${suffix}@example.com`,
      passwordHash: "test",
      watchlist: [],
    },
  });
  const other = await prisma.user.create({
    data: {
      email: `th-other-${suffix}@example.com`,
      passwordHash: "test",
      watchlist: [],
    },
  });

  let thesisId = "";
  const conditionIds: string[] = [];

  try {
    const created = await createThesisForUser(owner.id, {
      symbol: "AAPL",
      title: "Core holding thesis",
      note: "Long-term quality compounder framing.",
      status: "active",
      conditions: [
        {
          conditionType: "METRIC_GROWTH_ABOVE",
          label: "Revenue YoY growth stays above 25%",
          polarity: "support_if",
          params: {
            metricKey: "revenue",
            thresholdPercent: 25,
            period: "yoy",
          },
        },
        {
          conditionType: "CUSTOM_MANUAL",
          label: "Qualitative edge",
          polarity: "support_if",
          params: { text: "Not auto-verified." },
        },
      ],
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    thesisId = created.thesis.id;
    assert.equal(created.thesis.symbol, "AAPL");
    assert.equal(created.thesis.note, "Long-term quality compounder framing.");
    assert.equal(created.thesis.conditions.length, 2);

    const auto = created.thesis.conditions.find(
      (c) => c.conditionType === "METRIC_GROWTH_ABOVE"
    );
    const manual = created.thesis.conditions.find(
      (c) => c.conditionType === "CUSTOM_MANUAL"
    );
    assert.ok(auto);
    assert.ok(manual);
    assert.equal(auto!.evaluation.mode, "automated");
    assert.equal(auto!.evaluation.state, "UNKNOWN");
    assert.equal(manual!.evaluation.mode, "manual");
    assert.equal(manual!.evaluation.state, null);
    conditionIds.push(auto!.id, manual!.id);

    const dup = await createThesisForUser(owner.id, {
      symbol: "aapl",
      title: null,
      note: null,
      status: "active",
    });
    assert.equal(dup.ok, false);
    if (!dup.ok) assert.equal(dup.code, "DUPLICATE");

    // IDOR: other cannot fetch / update / delete / mutate conditions
    const idorGet = await getThesisForUser(other.id, thesisId);
    assert.equal(idorGet.ok, false);
    if (!idorGet.ok) assert.equal(idorGet.code, "NOT_FOUND");

    const idorPatch = await updateThesisForUser(other.id, thesisId, {
      title: "Hijacked",
    });
    assert.equal(idorPatch.ok, false);

    const idorCond = await addConditionForUser(other.id, thesisId, {
      conditionType: "CASH_RUNWAY_ABOVE",
      label: "Hack",
      polarity: "support_if",
      params: { quarters: 4 },
    });
    assert.equal(idorCond.ok, false);

    const idorReorder = await reorderConditionsForUser(other.id, thesisId, [
      ...conditionIds,
    ].reverse());
    assert.equal(idorReorder.ok, false);

    const idorDelCond = await deleteConditionForUser(
      other.id,
      thesisId,
      conditionIds[0]!
    );
    assert.equal(idorDelCond.ok, false);

    const idorDel = await deleteThesisForUser(other.id, thesisId);
    assert.equal(idorDel.ok, false);

    // Owner mutations
    const updated = await updateThesisForUser(owner.id, thesisId, {
      title: "Updated title",
      note: "Updated note",
    });
    assert.equal(updated.ok, true);
    if (updated.ok) {
      assert.equal(updated.thesis.title, "Updated title");
      assert.equal(updated.thesis.note, "Updated note");
    }

    const added = await addConditionForUser(owner.id, thesisId, {
      conditionType: "NO_EVENT_TYPE",
      label: "No new ATM event",
      polarity: "invalidate_if",
      params: { eventType: "atm_program" },
    });
    assert.equal(added.ok, true);
    if (!added.ok) return;
    conditionIds.push(added.conditionId);
    assert.equal(added.thesis.conditions.length, 3);

    const edited = await updateConditionForUser(
      owner.id,
      thesisId,
      added.conditionId,
      { label: "No ATM program draws" }
    );
    assert.equal(edited.ok, true);
    if (edited.ok) {
      const row = edited.thesis.conditions.find(
        (c) => c.id === added.conditionId
      );
      assert.equal(row?.label, "No ATM program draws");
    }

    const order = [
      added.conditionId,
      conditionIds[1]!,
      conditionIds[0]!,
    ];
    const reordered = await reorderConditionsForUser(
      owner.id,
      thesisId,
      order
    );
    assert.equal(reordered.ok, true);
    if (reordered.ok) {
      assert.deepEqual(
        reordered.thesis.conditions.map((c) => c.id),
        order
      );
      assert.deepEqual(
        reordered.thesis.conditions.map((c) => c.sortOrder),
        [0, 1, 2]
      );
    }

    const removed = await deleteConditionForUser(
      owner.id,
      thesisId,
      conditionIds[1]!
    );
    assert.equal(removed.ok, true);
    if (removed.ok) {
      assert.equal(
        removed.thesis.conditions.some((c) => c.id === conditionIds[1]),
        false
      );
    }

    const listed = await listThesesForUser(owner.id, { symbol: "AAPL" });
    assert.equal(listed.length, 1);

    const otherList = await listThesesForUser(other.id);
    assert.equal(otherList.length, 0);

    const deleted = await deleteThesisForUser(owner.id, thesisId);
    assert.equal(deleted.ok, true);
    const gone = await getThesisForUser(owner.id, thesisId);
    assert.equal(gone.ok, false);
    thesisId = "";
  } finally {
    if (thesisId) {
      await prisma.thesisCondition.deleteMany({ where: { thesisId } });
      await prisma.thesisEvaluation.deleteMany({ where: { thesisId } });
      await prisma.investmentThesis.deleteMany({ where: { id: thesisId } });
    }
    await prisma.investmentThesis.deleteMany({
      where: { userId: { in: [owner.id, other.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [owner.id, other.id] } },
    });
  }
});
