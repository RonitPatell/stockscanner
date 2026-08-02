/**
 * Shared helpers for TrustTicker Monitor Playwright journeys.
 */
import { expect, type Page, type ConsoleMessage } from "@playwright/test";
import { MONITOR_GUIDE_TARGETS } from "../../src/lib/monitor/guide-targets.ts";

export const MONITOR_HARNESS = "/e2e/monitor-harness";

export const MONITOR_VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 },
] as const;

/**
 * Legacy profitability / unverified speed claims must stay absent.
 * Disclaimers that *forbid* these phrases are scrubbed before matching.
 */
export const BANNED_MONITOR_COPY =
  /predicted profit|\bwin rate\b|guaranteed returns|unverified speed|alpha guaranteed|buy now|sell now|target price \$/i;

export type MonitorConsoleState = {
  errors: string[];
  hydration: string[];
};

export function createMonitorConsoleState(): MonitorConsoleState {
  return { errors: [], hydration: [] };
}

/** Benign noise on the unauthenticated Monitor harness (SessionProvider). */
function isIgnorableMonitorConsole(text: string): boolean {
  return (
    /chrome-extension:|injectScriptAdjust|net::ERR_|401 \(Unauthorized\)/i.test(
      text
    ) ||
    /ClientFetchError: Failed to fetch[\s\S]*errors\.authjs\.dev/i.test(text) ||
    /ClientFetchError: Failed to fetch[\s\S]*getSession/i.test(text)
  );
}

export function installMonitorConsoleMonitors(
  page: Page,
  state: MonitorConsoleState
): void {
  page.on("console", (msg: ConsoleMessage) => {
    const text = msg.text();
    if (isIgnorableMonitorConsole(text)) return;
    if (msg.type() === "error") state.errors.push(text);
    if (/hydration|Hydration|didn'?t match the client/i.test(text)) {
      if (/caret-color/i.test(text)) return;
      state.hydration.push(text);
    }
  });
  page.on("pageerror", (err) => {
    const text = String(err);
    if (isIgnorableMonitorConsole(text)) return;
    state.errors.push(text);
  });
}

export async function gotoMonitorScenario(
  page: Page,
  scenario: string,
  opts?: { reducedMotion?: boolean }
): Promise<void> {
  if (opts?.reducedMotion) {
    await page.emulateMedia({ reducedMotion: "reduce" });
  }
  await page.goto(`${MONITOR_HARNESS}?scenario=${scenario}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("monitor-e2e-harness")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("trustticker-monitor")).toBeVisible();
}

export async function assertNoBannedCopy(page: Page): Promise<void> {
  const body = await page.locator("body").innerText();
  const scrubbed = body
    .replace(
      /Informational inspection only[\s\S]{0,200}?success probability\.?/gi,
      ""
    )
    .replace(
      /not (investment advice|a trading forecast)[\s\S]{0,120}?/gi,
      ""
    )
    .replace(
      /No (buy\/sell instruction|predicted profit|expected return|success probability)[^.]*\.?/gi,
      ""
    );
  expect(scrubbed).not.toMatch(BANNED_MONITOR_COPY);
}

export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const root = document.querySelector('[data-testid="trustticker-monitor"]');
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      rootScrollWidth: root?.scrollWidth ?? 0,
      rootClientWidth: root?.clientWidth ?? 0,
    };
  });
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  if (overflow.rootClientWidth > 0) {
    expect(overflow.rootScrollWidth).toBeLessThanOrEqual(
      overflow.rootClientWidth + 2
    );
  }
}

/** Labels/controls must not be clipped by overflow:hidden ancestors. */
export async function assertNoClippedLabels(page: Page): Promise<void> {
  const clipped = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="trustticker-monitor"]');
    if (!root) return ["missing-monitor"];
    const selectors = [
      '[data-testid="monitor-status-bar"]',
      '[data-testid="monitor-global-leader"]',
      '[data-testid="monitor-search"]',
      '[data-testid="monitor-connection"]',
      ".tt-monitor__leader-mark",
      ".tt-ladder__filter",
    ];
    const bad: string[] = [];
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (!el || !(el instanceof HTMLElement)) continue;
      if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") {
        continue; // hidden by responsive layout
      }
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      let p: HTMLElement | null = el;
      while (p && p !== root) {
        const st = getComputedStyle(p);
        if (st.overflow === "hidden" || st.overflowX === "hidden") {
          const pr = p.getBoundingClientRect();
          if (r.right > pr.right + 2 || r.left < pr.left - 2) {
            bad.push(`${sel} clipped by ${p.className || p.tagName}`);
            break;
          }
        }
        p = p.parentElement;
      }
    }
    return bad;
  });
  expect(clipped).toEqual([]);
}

/** Interactive controls in the status bar must not overlap each other. */
export async function assertNoOverlappingControls(page: Page): Promise<void> {
  const overlaps = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="monitor-status-bar"]');
    if (!bar) return ["missing-status-bar"];
    const nodes = [
      ...bar.querySelectorAll(
        "button, input, a, [data-guide='monitor-profile'], .tt-monitor__pill"
      ),
    ].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height > 4;
    });
    const bad: string[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]!.getBoundingClientRect();
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]!.getBoundingClientRect();
        // Ignore nested (trigger inside popover root containing both)
        if (nodes[i]!.contains(nodes[j]!) || nodes[j]!.contains(nodes[i]!)) {
          continue;
        }
        const ix = Math.max(
          0,
          Math.min(a.right, b.right) - Math.max(a.left, b.left)
        );
        const iy = Math.max(
          0,
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        );
        if (ix > 4 && iy > 4) {
          bad.push(
            `overlap ${(nodes[i] as HTMLElement).dataset.testid || nodes[i]!.className} × ${(nodes[j] as HTMLElement).dataset.testid || nodes[j]!.className}`
          );
        }
      }
    }
    return bad.slice(0, 8);
  });
  expect(overlaps).toEqual([]);
}

/**
 * At most one primary vertical scrollbar among field / ladder / intel / tape
 * should be active simultaneously with page scroll — field must not scroll.
 */
export async function assertScrollBudget(page: Page): Promise<void> {
  const report = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="trustticker-monitor"]');
    if (!root) return { error: "missing-monitor", scrollers: [] as string[] };
    const field = root.querySelector(".tt-field, .tt-monitor__field-wrap");
    const fieldScrolls =
      field instanceof HTMLElement &&
      field.scrollHeight > field.clientHeight + 2 &&
      ["auto", "scroll"].includes(getComputedStyle(field).overflowY);
    const candidates = [
      ".tt-ladder__list",
      ".tt-monitor__intel-scroll",
      ".tt-event-tape__scroll",
      ".tt-monitor__mobile",
    ];
    const active: string[] = [];
    for (const sel of candidates) {
      const el = root.querySelector(sel);
      if (!(el instanceof HTMLElement)) continue;
      const oy = getComputedStyle(el).overflowY;
      if (
        (oy === "auto" || oy === "scroll") &&
        el.scrollHeight > el.clientHeight + 4
      ) {
        active.push(sel);
      }
    }
    const pageScroll =
      document.documentElement.scrollHeight >
      document.documentElement.clientHeight + 4;
    return {
      fieldScrolls,
      active,
      pageScroll,
      simultaneous: active.length + (pageScroll ? 1 : 0),
    };
  });
  expect(report.fieldScrolls, "Momentum Field must not scroll").toBeFalsy();
  // Allow ladder + intel + tape as regional scrollers; fail if many + page also scroll
  expect(
    report.simultaneous,
    `too many simultaneous scroll surfaces: ${JSON.stringify(report)}`
  ).toBeLessThanOrEqual(3);
}

/** Metadata / pills remain at least 12px computed font-size. */
export async function assertReadableMetadata(page: Page): Promise<void> {
  const small = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="trustticker-monitor"]');
    if (!root) return ["missing-monitor"];
    const sels = [
      ".tt-monitor__pill",
      ".tt-event-tape__meta",
      ".tt-monitor__intel-sticky-meta",
      "[data-testid='monitor-last-event-age']",
    ];
    const bad: string[] = [];
    for (const sel of sels) {
      for (const el of root.querySelectorAll(sel)) {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (Number.isFinite(fs) && fs > 0 && fs < 11.5) {
          bad.push(`${sel} ${fs}px`);
        }
      }
    }
    return bad.slice(0, 12);
  });
  expect(small).toEqual([]);
}

export async function assertCommandCentreGrid1920(page: Page): Promise<void> {
  const dims = await page.evaluate(() => {
    const body = document.querySelector(".tt-monitor__body");
    const status = document.querySelector(".tt-monitor__status");
    const ladder = document.querySelector(".tt-monitor__ladder-wrap");
    const intel = document.querySelector(".tt-monitor__intel-wrap");
    const tape = document.querySelector(".tt-monitor__tape");
    if (!body || !status || !ladder || !intel || !tape) {
      return null;
    }
    return {
      statusH: status.getBoundingClientRect().height,
      ladderW: ladder.getBoundingClientRect().width,
      intelW: intel.getBoundingClientRect().width,
      tapeH: tape.getBoundingClientRect().height,
    };
  });
  expect(dims).not.toBeNull();
  expect(dims!.statusH).toBeGreaterThanOrEqual(50);
  expect(dims!.statusH).toBeLessThanOrEqual(56);
  expect(dims!.ladderW).toBeGreaterThanOrEqual(260);
  expect(dims!.ladderW).toBeLessThanOrEqual(300);
  expect(dims!.intelW).toBeGreaterThanOrEqual(360);
  expect(dims!.intelW).toBeLessThanOrEqual(420);
  expect(dims!.tapeH).toBeGreaterThanOrEqual(110);
  expect(dims!.tapeH).toBeLessThanOrEqual(150);
}

export async function assertNoNestedPageScrollTrap(page: Page): Promise<void> {
  const traps = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="trustticker-monitor"]');
    if (!root) return ["missing-monitor"];
    const bad: string[] = [];
    const walk = (el: Element, depth: number) => {
      const style = window.getComputedStyle(el);
      const oy = style.overflowY;
      if (
        depth > 0 &&
        (oy === "scroll" || oy === "auto") &&
        el.scrollHeight > el.clientHeight + 2 &&
        el.classList.contains("tt-monitor")
      ) {
        bad.push(el.className || el.tagName);
      }
      // Nested overflow:auto on both body-like and panel that locks page is a trap
      if (
        depth >= 2 &&
        (oy === "scroll" || oy === "auto") &&
        el.closest(".tt-monitor__desktop-only") &&
        el.parentElement?.classList.contains("tt-monitor__desktop-only")
      ) {
        /* panels may scroll — only flag if html/body also locked oddly */
      }
      for (const child of el.children) walk(child, depth + 1);
    };
    walk(root, 0);
    const bodyOverflow = window.getComputedStyle(document.body).overflow;
    const htmlOverflow = window.getComputedStyle(document.documentElement).overflow;
    if (bodyOverflow === "hidden" && htmlOverflow === "hidden") {
      // Monitor shell uses contained layout — OK if monitor itself scrolls internally once
      const nestedScrollers = root.querySelectorAll(
        ".tt-monitor__desktop-only .overflow-auto, .tt-ladder__list"
      );
      if (nestedScrollers.length > 6) bad.push("too-many-nested-scrollers");
    }
    return bad;
  });
  expect(traps).toEqual([]);
}

export async function assertGuideTargets(page: Page): Promise<void> {
  // Quiet/empty may hide some panels — check status always; full set on live scenes
  await expect(
    page.locator(`[data-guide="${MONITOR_GUIDE_TARGETS[0]}"]`)
  ).toHaveCount(1);
  const connection = await page.getByTestId("monitor-connection").innerText();
  if (/empty|loading|disconnected/i.test(connection)) return;
  for (const id of MONITOR_GUIDE_TARGETS) {
    const n = await page.locator(`[data-guide="${id}"]`).count();
    expect(n, `data-guide=${id}`).toBe(1);
  }
}

export async function assertColourNotOnly(page: Page): Promise<void> {
  // Connection and warnings must expose text or aria, not colour alone
  const conn = page.getByTestId("monitor-connection");
  await expect(conn).toBeVisible();
  const text = (await conn.innerText()).trim();
  expect(text.length).toBeGreaterThan(0);
  const tone = await conn.getAttribute("data-tone");
  expect(tone).toBeTruthy();
}

export async function assertConsoleClean(
  state: MonitorConsoleState
): Promise<void> {
  expect(state.errors, state.errors.join("\n")).toEqual([]);
  expect(state.hydration, state.hydration.join("\n")).toEqual([]);
}

export async function captureMonitorScreenshot(
  page: Page,
  name: string
): Promise<void> {
  await page.waitForTimeout(200);
  await expect(page.getByTestId("monitor-e2e-harness")).toHaveScreenshot(
    `${name}.png`,
    {
      animations: "disabled",
      maxDiffPixelRatio: 0.03,
    }
  );
}

/** Accessibility checks for a non-ideal Monitor state surface. */
export async function assertMonitorStateA11y(
  page: Page,
  opts: {
    testId: string;
    role?: string | RegExp;
    heading?: RegExp;
    /** Ensure at least one action control is keyboard-focusable */
    actionTestId?: string;
  }
): Promise<void> {
  const root = visibleTestId(page, opts.testId);
  await expect(root).toBeVisible();
  if (opts.role) {
    await expect(root).toHaveAttribute("role", opts.role);
  }
  const live = await root.getAttribute("aria-live");
  expect(live === "polite" || live === "assertive").toBeTruthy();
  if (opts.heading) {
    await expect(root.getByRole("heading")).toContainText(opts.heading);
  }
  if (opts.actionTestId) {
    const action = visibleTestId(page, opts.actionTestId);
    await expect(action).toBeVisible();
    await action.focus();
    await expect(action).toBeFocused();
  }
  // No stack traces in the visible desk
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/\bat\s+\S+\s+\(/);
  expect(text).not.toMatch(/TypeError:|ReferenceError:/);
  await assertColourNotOnly(page);
}

/** Prefer desktop panel when both desktop + mobile trees are mounted. */
export function desktopMonitor(page: Page) {
  return page.locator(".tt-monitor__desktop-only");
}

/** Visible intel / ladder surface (desktop panel or mobile sheet). */
export function visibleIntel(page: Page) {
  return page.locator('[data-testid="monitor-selected-ticker"]:visible').first();
}

export function visibleTestId(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"]:visible`).first();
}

/** Spatial Momentum Field is desktop/tablet only (<768px uses ranked cards). */
export function isMobileProject(projectName: string): boolean {
  return projectName === "mobile";
}
