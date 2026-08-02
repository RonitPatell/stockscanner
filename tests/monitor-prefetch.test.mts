import assert from "node:assert/strict";
import test from "node:test";
import {
  canPrefetchMonitor,
  prefetchMonitorRouteOnce,
  MONITOR_ROUTE_HREF,
} from "../src/lib/monitor/prefetch-gate.ts";

test("canPrefetchMonitor requires subscription and explicit monitorEnabled", () => {
  assert.equal(canPrefetchMonitor({ subscribed: false }), false);
  assert.equal(canPrefetchMonitor({ subscribed: true }), false);
  assert.equal(
    canPrefetchMonitor({ subscribed: true, monitorEnabled: false }),
    false
  );
  assert.equal(
    canPrefetchMonitor({ subscribed: true, monitorEnabled: true }),
    true
  );
});

test("MONITOR_ROUTE_HREF targets view=monitor", () => {
  assert.equal(MONITOR_ROUTE_HREF, "/dashboard?view=monitor");
});

test("prefetchMonitorRouteOnce no-ops without access", async () => {
  const state = { done: false };
  let calls = 0;
  const result = await prefetchMonitorRouteOnce(
    {
      prefetch: () => {
        calls += 1;
      },
    },
    { subscribed: false },
    state
  );
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});

test("prefetchMonitorRouteOnce calls router once when entitled", async () => {
  const state = { done: false };
  const hrefs: string[] = [];
  const first = await prefetchMonitorRouteOnce(
    {
      prefetch: (href) => {
        hrefs.push(href);
      },
    },
    { subscribed: true, monitorEnabled: true },
    state
  );
  assert.equal(first.ok, true);
  assert.deepEqual(hrefs, [MONITOR_ROUTE_HREF]);

  const again = await prefetchMonitorRouteOnce(
    {
      prefetch: (href) => {
        hrefs.push(href);
      },
    },
    { subscribed: true, monitorEnabled: true },
    state
  );
  assert.equal(again.ok, false);
  assert.equal(hrefs.length, 1);
});

test("prefetch does not imply snapshot polling", () => {
  // Contract: gate helpers never reference snapshot API paths.
  assert.equal(MONITOR_ROUTE_HREF.includes("/api/monitor/snapshot"), false);
});
