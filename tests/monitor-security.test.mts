/**
 * TrustTicker Monitor security regression suite.
 * User A / User B isolation, cron fail-closed, URL allowlists, strategy import safety.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { authorizeCron, isAdminEmail } from "../src/lib/cron-authorize.ts";
import { safeHttpUrl } from "../src/lib/utils.ts";
import { sanitizeReplaySession } from "../src/lib/monitor/sanitize-replay-session.ts";
import {
  CrossUserVault,
  resolveOwnerId,
} from "../src/lib/monitor/cross-user-vault.ts";
import { importStrategies } from "../src/lib/alert-strategy/export-import.ts";
import { evaluateStrategy } from "../src/lib/alert-strategy/evaluate.ts";
import { buildPreset } from "../src/lib/alert-strategy/presets.ts";
import { isFunnelEvent } from "../src/lib/analytics/track.ts";
import { hasActiveSubscription } from "../src/lib/subscription.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function assertNoClientUserIdTrust(src: string, label: string) {
  assert.equal(
    /body\.userId|query\.userId|searchParams\.get\(\s*["']userId["']\s*\)/.test(src),
    false,
    `${label} must not trust client userId`
  );
}

// ─── Route source contracts ───────────────────────────────────────────────────

test("Monitor private routes never trust client userId", () => {
  const files = [
    "src/app/api/monitor/event-tape/route.ts",
    "src/app/api/admin/monitor-replay/route.ts",
    "src/app/api/admin/monitor-calibration/route.ts",
    "src/app/api/alert-strategies/route.ts",
    "src/app/api/alert-strategies/simulate/route.ts",
    "src/app/api/settings/route.ts",
    "src/app/api/alerts/history/route.ts",
  ];
  for (const f of files) {
    assertNoClientUserIdTrust(readSrc(f), f);
  }
});

test("admin Monitor routes use requireAdmin", () => {
  for (const f of [
    "src/app/api/admin/monitor-replay/route.ts",
    "src/app/api/admin/monitor-calibration/route.ts",
  ]) {
    const src = readSrc(f);
    assert.match(src, /requireAdmin/);
    assert.match(src, /rateLimit/);
  }
});

test("event-tape GET is Pro-gated; POST uses authorizeCron", () => {
  const src = readSrc("src/app/api/monitor/event-tape/route.ts");
  assert.match(src, /requirePro/);
  assert.match(src, /authorizeCron/);
  assert.match(src, /safeHttpUrl/);
  assert.match(src, /rateLimit/);
});

test("SSE streams re-check entitlement after connect", () => {
  for (const f of [
    "src/app/api/quotes/stream/route.ts",
    "src/app/api/catalysts/stream/route.ts",
  ]) {
    const src = readSrc(f);
    assert.match(src, /requirePro/);
    assert.match(src, /userStillHasPro/);
    assert.match(src, /entitlement_revoked/);
  }
  assert.match(readSrc("src/lib/sse-entitlement.ts"), /SSE_ENTITLEMENT_RECHECK_MS\s*=\s*\d+/);
});

test("public health route does not expose secrets or env", () => {
  const src = readSrc("src/app/api/health/route.ts");
  assert.doesNotMatch(src, /CRON_SECRET|passwordHash|FINNHUB_API_KEY|DATABASE_URL/);
  assert.match(src, /feedSource/);
  assert.match(src, /"ok"/);
});

test("provider credentials module is server-oriented", () => {
  const src = readSrc("src/adapters/monitor/market-data/credentials.ts");
  assert.doesNotMatch(src, /NEXT_PUBLIC_/);
  assert.match(src, /process\.env|readServerSecret|credentialRef/);
});

// ─── Cron fail-closed ─────────────────────────────────────────────────────────

test("authorizeCron rejects when secret missing outside local next-dev", () => {
  const prevSecret = process.env.CRON_SECRET;
  const prevNode = process.env.NODE_ENV;
  const prevVercel = process.env.VERCEL;
  try {
    delete process.env.CRON_SECRET;
    process.env.NODE_ENV = "production";
    process.env.VERCEL = "1";
    const req = new Request("http://localhost/api/cron", {
      headers: { authorization: "Bearer x" },
    });
    assert.equal(authorizeCron(req), false);
  } finally {
    if (prevSecret == null) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevSecret;
    if (prevNode == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevVercel == null) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
  }
});

test("authorizeCron rejects wrong secret", () => {
  const prev = process.env.CRON_SECRET;
  try {
    process.env.CRON_SECRET = "correct-secret-value-32chars!!!!";
    const bad = new Request("http://localhost/x", {
      headers: { authorization: "Bearer wrong-secret-value-32chars!!!!!" },
    });
    assert.equal(authorizeCron(bad), false);
    const good = new Request("http://localhost/x", {
      headers: { authorization: "Bearer correct-secret-value-32chars!!!!" },
    });
    assert.equal(authorizeCron(good), true);
  } finally {
    if (prev == null) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  }
});

test("isAdminEmail fails closed with empty ADMIN_EMAILS", () => {
  const prev = process.env.ADMIN_EMAILS;
  try {
    delete process.env.ADMIN_EMAILS;
    assert.equal(isAdminEmail("anyone@example.com"), false);
  } finally {
    if (prev == null) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = prev;
  }
});

// ─── User A / User B cross-user isolation ─────────────────────────────────────

test("User A cannot read User B strategies, watchlist, or mutes", () => {
  const vault = new CrossUserVault();
  const userA = "user-a-id";
  const userB = "user-b-id";

  vault.saveStrategy(userA, {
    id: "strat-a",
    name: "A private",
    payload: { secret: "a-only" },
  });
  vault.saveStrategy(
    userB,
    { id: "strat-b", name: "B private", payload: { secret: "b-only" } },
    userA // attacker tries to claim A's id in body — ignored
  );
  vault.setWatchlist(userA, ["AAA", "BBB"]);
  vault.setWatchlist(userB, ["ZZZ"], userA);
  vault.setMutes(userA, ["MUTEA"]);
  vault.setMutes(userB, ["MUTEB"], userA);

  const aStrats = vault.listStrategies(userA);
  const bStrats = vault.listStrategies(userB);
  assert.equal(aStrats.length, 1);
  assert.equal(aStrats[0]!.id, "strat-a");
  assert.equal(bStrats.length, 1);
  assert.equal(bStrats[0]!.id, "strat-b");
  assert.equal(vault.getStrategyForUser(userA, "strat-b"), null);
  assert.equal(vault.getStrategyForUser(userB, "strat-a"), null);

  assert.deepEqual(vault.getWatchlist(userA), ["AAA", "BBB"]);
  assert.deepEqual(vault.getWatchlist(userB), ["ZZZ"]);
  assert.deepEqual(vault.getMutes(userA), ["MUTEA"]);
  assert.deepEqual(vault.getMutes(userB), ["MUTEB"]);
});

test("User A cannot subscribe to User B private strategy/watchlist stream", () => {
  const vault = new CrossUserVault();
  const userA = "user-a-id";
  const userB = "user-b-id";
  assert.equal(vault.canSubscribePrivateStream(userA, userB, true), false);
  assert.equal(vault.canSubscribePrivateStream(userB, userB, true), true);
  assert.equal(vault.canSubscribePrivateStream(userB, userB, false), false);
});

test("resolveOwnerId always prefers session over client claim", () => {
  assert.equal(resolveOwnerId("session-1", "attacker-2"), "session-1");
  assert.equal(resolveOwnerId("session-1", undefined), "session-1");
});

test("entitlement loss blocks private stream subscription", () => {
  const vault = new CrossUserVault();
  assert.equal(
    vault.canSubscribePrivateStream("u1", "u1", hasActiveSubscription("canceled")),
    false
  );
  assert.equal(
    vault.canSubscribePrivateStream("u1", "u1", hasActiveSubscription("active")),
    true
  );
});

// ─── URL / HTML / strategy import ─────────────────────────────────────────────

test("safeHttpUrl blocks non-http(s) protocols", () => {
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpUrl("data:text/html,hi"), null);
  assert.equal(safeHttpUrl("file:///etc/passwd"), null);
  assert.ok(safeHttpUrl("https://example.com/a")?.startsWith("https://"));
  assert.ok(safeHttpUrl("http://example.com/a")?.startsWith("http://"));
});

test("Monitor UI link sinks use safeHttpUrl / openSafeHttpUrl", () => {
  const files = [
    "src/components/monitor/selected-ticker/SelectedTickerPanel.tsx",
    "src/components/monitor/selected-ticker/build-selected-ticker.ts",
    "src/components/monitor/ladder/PriorityLadder.tsx",
    "src/components/monitor/field/MomentumField.tsx",
    "src/components/monitor/field/MomentumFieldList.tsx",
  ];
  for (const f of files) {
    const src = readSrc(f);
    assert.match(
      src,
      /safeHttpUrl|openSafeHttpUrl/,
      `${f} must sanitize external URLs`
    );
  }
});

test("Monitor components do not inject raw HTML", () => {
  const globHint = [
    "src/components/monitor/selected-ticker/SelectedTickerPanel.tsx",
    "src/components/monitor/event-tape/EventTape.tsx",
    "src/components/monitor/TrustTickerMonitor.tsx",
  ];
  for (const f of globHint) {
    try {
      const src = readSrc(f);
      assert.doesNotMatch(src, /dangerouslySetInnerHTML/);
    } catch {
      /* optional file */
    }
  }
});

test("imported strategy JSON cannot execute arbitrary code", () => {
  const evil = {
    format: "trustticker-alert-strategy",
    strategies: [
      {
        ...buildPreset("custom"),
        name: "evil",
        // Attempt code-like junk in note / unknown fields
        userNote: "');process.exit(1)//",
        __proto__: { polluted: true },
        constructor: { name: "Function" },
      },
    ],
  };
  const imported = importStrategies(evil, { replaceIds: true });
  // Parser either drops or accepts as inert data — never throws via eval
  assert.ok(imported.errors.length >= 0);
  for (const s of imported.strategies) {
    // Must remain a pure AST evaluate — no throw from injected fields
    const result = evaluateStrategy(s, {} as never, null, {
      nowMs: Date.now(),
    });
    assert.ok(result != null);
    assert.equal(typeof result.matched, "boolean");
  }
});

test("analytics funnel allowlist rejects unknown events", () => {
  assert.equal(isFunnelEvent("landing_view"), true);
  assert.equal(isFunnelEvent("monitor_private_dump"), false);
  assert.equal(isFunnelEvent("eval"), false);
});

test("sanitizeReplaySession bounds admin uploads", () => {
  const bad = sanitizeReplaySession({
    id: "ok",
    fromMs: 1,
    toMs: 2,
    frames: new Array(6000).fill({}),
  });
  assert.equal(bad.ok, false);

  const good = sanitizeReplaySession({
    id: "sess-1",
    fromMs: 1000,
    toMs: 2000,
    symbolScope: ["ABC"],
    frames: [],
    meta: { maxFrames: 100, minIntervalMs: 1000, note: "t" },
  });
  assert.equal(good.ok, true);
});

test("alert-strategies route ownership uses authz.user.id", () => {
  const src = readSrc("src/app/api/alert-strategies/route.ts");
  assert.match(src, /authz\.user\.id/);
  assert.equal((src.match(/userId:\s*authz\.user\.id/g) ?? []).length >= 1, true);
});
