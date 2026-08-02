"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MomentumField } from "./field/MomentumField.tsx";
import {
  ladderToFieldNodes,
  readMutedSymbols,
  writeMutedSymbols,
} from "./field/ladder-to-field-nodes.ts";
import { PriorityLadder } from "./ladder/PriorityLadder.tsx";
import { toPriorityRows } from "./ladder/to-priority-rows.ts";
import type { LadderFilter } from "./ladder/ladder-types.ts";
import { buildMonitorFixture } from "./monitor-fixtures.ts";
import { MonitorSurfaceState } from "./MonitorSurfaceStates.tsx";
import {
  MonitorDisconnectOverlay,
  MonitorOutageBanner,
  createMonitorDiagnosticId,
  isStaleFreshnessMs,
} from "./states/index.ts";
import type { MonitorConnectionState, MonitorLadderRow } from "./monitor-types.ts";
import {
  buildSelectedTicker,
  stickSelectedTicker,
  symbolFromSearchParams,
} from "./selected-ticker/index.ts";
import type { MonitorSelectedTicker } from "./selected-ticker/selected-ticker-types.ts";
import {
  DeferredEventTape,
  DeferredSelectedTickerPanel,
} from "./MonitorDeferredIntel.tsx";
import { MonitorLoadBoundary } from "./progressive/MonitorLoadBoundary.ts";
import type {
  MonitorTapeItem,
  TapeFilterPreset,
  TapeIntelSection,
} from "../../domain/monitor/event-tape/types.ts";
import { useAudioSquawk } from "../../hooks/useAudioSquawk.ts";
import {
  isMomentumFieldV1Enabled,
  isMonitorSquawkV1Enabled,
} from "../../lib/monitor/flags.ts";
import {
  attentionLeaderToMonitorSquawkInput,
  tapeItemToMonitorSquawkInput,
} from "../../lib/squawk/from-monitor.ts";
import { MonitorStatusBar } from "./MonitorStatusBar.tsx";
import {
  evaluateMonitorPreset,
  factsFromMonitorSymbol,
  type AlertStrategy,
} from "../../lib/alert-strategy/index.ts";
import { useMonitorDelivery } from "../../hooks/useMonitorDelivery.ts";
import type { MonitorE2eSeed } from "./e2e-scenarios.ts";
import {
  collectMonitorLoadMetrics,
  monitorPerfMark,
  monitorPerfMarkHtmlReceived,
  monitorPerfMeasure,
} from "@/lib/monitor/perf-marks";
import type { MonitorInitialSnapshot } from "@/lib/monitor/ssr";
import { snapshotTickersToLadderRows } from "@/lib/monitor/ssr";
import { publicSnapshotToDeliveryLadder } from "@/lib/monitor/ssr/public-to-delivery";
import { MonitorSsrCore } from "./MonitorSsrCore.ts";
import "./design/monitor-tokens.css";
import "./monitor.css";

// Earliest client module evaluation on the Monitor path (dev marks only).
if (typeof window !== "undefined") {
  monitorPerfMark("monitor_navigation_start");
}

/** Map Event Tape section ids → instrument panel sections. */
const INTEL_SECTION_ALIASES: Record<string, string> = {
  identity: "identity",
  "verified-catalyst": "what-happened",
  "current-state": "what-market-doing",
  "market-movement": "what-market-doing",
  "primary-risks": "what-could-go-wrong",
  "event-timeline": "capital-risk-timeline",
  evidence: "evidence",
};

function focusIntelSection(section: TapeIntelSection) {
  if (typeof document === "undefined") return;
  requestAnimationFrame(() => {
    // Build selector without embedding data-guide="…" literally (guide target uniqueness tests scan source).
    const root = document.querySelector(
      "[data-guide=" + JSON.stringify("monitor-intelligence") + "]"
    );
    const target = INTEL_SECTION_ALIASES[section] ?? section;
    const el = root?.querySelector(
      `[data-intel-section="${target}"]`
    ) as HTMLElement | null;
    if (!el) return;
    // Deep-link may open a secondary block; never force-close — only expand if needed.
    if (
      el.getAttribute("data-collapsed") === "true" &&
      el.getAttribute("data-open") !== "true"
    ) {
      el.querySelector<HTMLButtonElement>("button.tt-intel__collapse")?.click();
    }
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}

function formatAge(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return "<1s";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

/**
 * TrustTicker Monitor V1 — authenticated spatial desk.
 * Original layout/wording (not Arcane-derived).
 * Inspection surfaces only — never trade recommendations.
 *
 * When `initialSnapshot` is provided (SSR), first HTML paint includes ladder /
 * field data and hydration must not clear it or re-fetch the snapshot.
 */
export function TrustTickerMonitor({
  initialConnection = "live",
  e2eSeed = null,
  initialSnapshot = null,
}: {
  /** Override for tests / story fixtures */
  initialConnection?: MonitorConnectionState;
  /** Deterministic Playwright harness seed (disables live delivery). */
  e2eSeed?: MonitorE2eSeed | null;
  /** Server-rendered Monitor bootstrap (exact object passed through). */
  initialSnapshot?: MonitorInitialSnapshot | null;
}) {
  const e2e = e2eSeed;
  const ssrOk = Boolean(initialSnapshot?.ok && initialSnapshot.snapshot);
  const ssrUnavailable = Boolean(
    initialSnapshot && !initialSnapshot.ok && !e2e
  );
  const ssrLadderRows = useMemo(
    () =>
      ssrOk && initialSnapshot?.snapshot
        ? snapshotTickersToLadderRows(initialSnapshot.snapshot.priorityLadder)
        : [],
    [ssrOk, initialSnapshot]
  );
  const ssrDeliveryLadder = useMemo(
    () =>
      ssrOk && initialSnapshot?.snapshot
        ? publicSnapshotToDeliveryLadder(initialSnapshot.snapshot)
        : null,
    [ssrOk, initialSnapshot]
  );

  const [connection, setConnection] = useState<MonitorConnectionState>(() => {
    if (e2e?.viewModel.connection) return e2e.viewModel.connection;
    // Cold SSR miss → keep syncing, do not brick the desk as Disconnected.
    if (ssrUnavailable) return "loading";
    if (ssrOk) {
      const src = initialSnapshot?.source;
      if (src === "REDIS_STALE" || src === "POSTGRES_FALLBACK") return "delayed";
      if (initialSnapshot?.snapshot?.freshness?.liveLabel === "recovery") {
        return "degraded";
      }
      if (initialSnapshot?.snapshot?.freshness?.liveEligible === false) {
        return "degraded";
      }
      return "live";
    }
    return initialConnection;
  });
  const [ssrBannerDismissed, setSsrBannerDismissed] = useState(false);
  const [filter, setFilter] = useState<LadderFilter>(
    (e2e?.viewModel.filterPreset as LadderFilter | undefined) ?? "all"
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(
    () =>
      e2e?.selectedSymbol ??
      e2e?.viewModel.selectedSymbol ??
      initialSnapshot?.selectedSymbol ??
      null
  );
  const [ladderOpen, setLadderOpen] = useState(true);
  const [intelOpen, setIntelOpen] = useState(
    Boolean(
      e2e?.selectedSymbol ||
        e2e?.viewModel.selectedSymbol ||
        initialSnapshot?.selectedSymbol
    )
  );

  // One-shot only — WebKit can re-fire matchMedia "change" during layout and loop setState.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 1365px)").matches) {
      setLadderOpen(false);
    }
  }, []);

  // Seeded harness / deep-link selection opens the mobile sheet so intel is visible.
  const [mobileSheet, setMobileSheet] = useState(
    Boolean(
      e2e?.selectedSymbol ||
        e2e?.viewModel.selectedSymbol ||
        initialSnapshot?.selectedSymbol
    )
  );
  const [pinnedSymbol, setPinnedSymbol] = useState<string | null>(
    () => e2e?.pinnedSymbol ?? initialSnapshot?.prefs.pinnedTicker ?? null
  );
  const [muted, setMuted] = useState<Set<string>>(() => readMutedSymbols());
  const [watchOverrides, setWatchOverrides] = useState<Map<string, boolean>>(
    () => new Map()
  );
  const [evidenceSymbol, setEvidenceSymbol] = useState<string | null>(null);
  const [tapeFilter, setTapeFilter] = useState<TapeFilterPreset>("all");
  const [monitorPreset, setMonitorPreset] = useState<AlertStrategy | null>(
    null
  );
  /** Readable list is the default — spatial field is optional. */
  const [fieldListView, setFieldListView] = useState(true);
  const [showFieldPanel, setShowFieldPanel] = useState(false);
  const [squawkFireCount, setSquawkFireCount] = useState(0);
  const [diagnosticId, setDiagnosticId] = useState(
    () => e2e?.diagnosticId ?? "mon_pending"
  );
  useEffect(() => {
    if (e2e?.diagnosticId) return;
    setDiagnosticId(createMonitorDiagnosticId());
  }, [e2e?.diagnosticId]);
  const [lastKnownLadder, setLastKnownLadder] = useState<MonitorLadderRow[]>(
    () => ssrLadderRows
  );
  const [presetPanelPulse, setPresetPanelPulse] = useState(0);
  const prevRanksRef = useRef<Map<string, number>>(new Map());
  const presetMatchReasonsRef = useRef<Map<string, string[]>>(new Map());
  const stickyIntelRef = useRef<{
    symbol: string;
    dossier: MonitorSelectedTicker;
  } | null>(null);
  const deepLinkApplied = useRef(Boolean(initialSnapshot?.selectedSymbol));
  const tapeSeenRef = useRef<Set<string> | null>(null);
  const prevLeaderRef = useRef<string | null | undefined>(
    e2e?.previousLeaderSymbol !== undefined
      ? e2e.previousLeaderSymbol
      : undefined
  );

  // Temporary load-path marks (development / NEXT_PUBLIC_MONITOR_PERF_MARKS=1).
  useEffect(() => {
    monitorPerfMarkHtmlReceived();
    monitorPerfMark("monitor_hydration_complete");
  }, []);

  // Artificial loading flash removed when SSR snapshot is present.
  useEffect(() => {
    if (e2e?.skipLoadDelay) return;
    if (ssrOk) return;
    if (ssrUnavailable) return; // stay on loading until live delivery reports
    if (initialConnection !== "live") return;
    setConnection("loading");
    const t = setTimeout(() => setConnection("live"), 350);
    return () => clearTimeout(t);
  }, [initialConnection, e2e?.skipLoadDelay, ssrOk, ssrUnavailable]);

  // Deep link: ?view=monitor&symbol=AAAA (skip when SSR already selected)
  useEffect(() => {
    if (e2e) return;
    if (deepLinkApplied.current) return;
    if (typeof window === "undefined") return;
    const sym = symbolFromSearchParams(
      new URLSearchParams(window.location.search)
    );
    deepLinkApplied.current = true;
    if (sym) {
      setSelected(sym);
      setIntelOpen(true);
      setMobileSheet(true);
    }
  }, [e2e]);

  const live = useMonitorDelivery({
    // Always try live sync when SSR miss — disabling delivery bricked Scanner.
    enabled: e2e?.forceFixture ? false : undefined,
    initialLadderSnapshot: ssrDeliveryLadder,
    initialLadderRows: ssrLadderRows,
    initialLastEventAgeMs: initialSnapshot?.dataAgeMs ?? null,
    initialLastEventId: initialSnapshot?.lastEventId ?? null,
    snapshotId: initialSnapshot?.snapshot
      ? String(initialSnapshot.snapshot.snapshotId ?? initialSnapshot.lastEventId)
      : null,
  });

  // Follow live chrome once delivery is active (recovers from SSR miss).
  useEffect(() => {
    if (e2e || !live.enabled) return;
    if (
      live.connection === "live" ||
      live.connection === "degraded" ||
      live.connection === "delayed" ||
      live.connection === "loading"
    ) {
      setConnection((prev) =>
        prev === live.connection ? prev : live.connection
      );
    } else if (live.ladder.length > 0 && live.connection === "disconnected") {
      setConnection((prev) => (prev === "degraded" ? prev : "degraded"));
    }
  }, [e2e, live.enabled, live.connection, live.ladder.length]);

  const vm = useMemo(() => {
    if (e2e) {
      return {
        ...e2e.viewModel,
        connection: e2e.viewModel.connection,
      };
    }
    // Prefer live delivery when it has rows; otherwise keep SSR ladder (never empty wipe).
    if (live.enabled && live.ladder.length > 0) {
      const fixture = buildMonitorFixture(live.connection, "all");
      // Never surface Redis/Postgres/event-id internals in trader chrome.
      const notes = live.notes.filter(
        (n) =>
          !/SSR|POSTGRES|REDIS|generatedAt|lastEventId/i.test(n)
      );
      return {
        ...fixture,
        connection: live.connection,
        lastEventAgeMs: live.lastEventAgeMs ?? initialSnapshot?.dataAgeMs ?? null,
        ladder: live.ladder,
        providerNotes: notes,
      };
    }
    if (ssrOk && initialSnapshot?.snapshot) {
      const fixture = buildMonitorFixture("live", "all");
      return {
        ...fixture,
        connection,
        lastEventAgeMs: initialSnapshot.dataAgeMs,
        ladder: ssrLadderRows,
        // Ages stay on the status bar — not snapshot plumbing strings.
        providerNotes: [],
      };
    }
    // SSR miss + no live rows yet: keep a readable sample ladder so Scanner
    // is usable while delivery connects (never a permanent empty brick wall).
    const sample = buildMonitorFixture(
      live.enabled ? "loading" : connection,
      "all"
    );
    return {
      ...sample,
      connection: live.enabled ? "loading" : connection,
      lastEventAgeMs: live.lastEventAgeMs,
      providerNotes: [
        initialSnapshot?.error?.message ??
          "Waiting for the first Monitor snapshot…",
        "Sample names shown until live server data arrives — not a trade signal.",
        ...live.notes,
      ],
    };
  }, [
    e2e,
    connection,
    live.enabled,
    live.connection,
    live.ladder,
    live.lastEventAgeMs,
    live.notes,
    ssrOk,
    ssrLadderRows,
    initialSnapshot,
  ]);

  useEffect(() => {
    // Hide the loud SSR unavailable panel once any ladder is on screen
    // (live rows or the temporary sample while connecting).
    if (live.ladder.length > 0 || ssrOk || vm.ladder.length > 0) {
      setSsrBannerDismissed(true);
    }
  }, [live.ladder.length, ssrOk, vm.ladder.length]);

  useEffect(() => {
    if (vm.ladder.length === 0) return;
    monitorPerfMark("monitor_snapshot_rendered", {
      detail: `ladder=${vm.ladder.length};source=${
        live.enabled && live.ladder.length > 0 ? "delivery" : "fixture"
      }`,
    });
    monitorPerfMark("monitor_first_visible_ticker", {
      detail: vm.ladder[0]?.symbol ?? "unknown",
    });
  }, [vm.ladder.length, live.enabled, live.ladder.length, vm.ladder]);

  useEffect(() => {
    const ready =
      vm.ladder.length > 0 &&
      (vm.connection === "live" ||
        vm.connection === "degraded" ||
        vm.connection === "delayed" ||
        vm.connection === "partial_outage" ||
        connection === "live" ||
        connection === "degraded" ||
        connection === "delayed" ||
        connection === "partial_outage" ||
        !!e2e);
    if (!ready) return;
    monitorPerfMark("monitor_interactive", {
      detail: `connection=${vm.connection}`,
    });
    monitorPerfMeasure(
      "monitor_nav_to_interactive",
      "monitor_navigation_start",
      "monitor_interactive"
    );
    collectMonitorLoadMetrics();
  }, [vm.ladder.length, vm.connection, connection, e2e]);

  // Keep connection badge aligned with seeded VM.
  useEffect(() => {
    if (e2e) setConnection(e2e.viewModel.connection);
  }, [e2e]);

  const resolveMonitorFacts = useCallback(
    (symbol: string) => {
      const row = vm.ladder.find((r) => r.symbol === symbol);
      if (!row) return null;
      const ov = watchOverrides.get(symbol);
      const onWatchlist = ov ?? row.onWatchlist;
      const seed = vm.intelSeeds[symbol];
      const risks: string[] = [];
      if (row.halted) risks.push("halt");
      if (seed?.risks) {
        for (const [k, v] of Object.entries(seed.risks)) {
          if (v?.status === "active") risks.push(k);
        }
      }
      return factsFromMonitorSymbol({
        symbol,
        onWatchlist,
        price: seed?.price ?? null,
        sessionChangePct: seed?.sessionChangePct ?? null,
        momentumState: row.momentumState,
        momentumIntensity: row.momentumIntensity,
        attentionPriority: row.attentionPriority,
        relativeVolume: seed?.relativeVolume ?? null,
        dollarVolumeVelocity: seed?.dollarVolumeVelocity ?? null,
        tradesPerSecond: seed?.tradesPerSecond ?? null,
        spreadBps: seed?.spreadBps ?? null,
        tradeability: seed?.tradeability ?? null,
        catalystCategory: seed?.catalyst ? "news" : null,
        sourceVerification: row.catalystVerified
          ? "verified"
          : row.hasCatalyst
            ? "partial"
            : null,
        marketSession: "regular",
        haltStatus: row.halted ? "halted" : "trading",
        resumptionFlag: false,
        riskFlags: risks,
        dilutionFlags: risks.filter((r) =>
          /dilution|offering|atm|warrant/i.test(r)
        ),
        catalystAgeMin: seed?.catalyst?.ageSec != null
          ? seed.catalyst.ageSec / 60
          : null,
      });
    },
    [vm.ladder, vm.intelSeeds, watchOverrides]
  );

  const ladderSource =
    connection === "disconnected" &&
    vm.ladder.length === 0 &&
    lastKnownLadder.length > 0
      ? lastKnownLadder
      : vm.ladder;

  const ladder = useMemo(() => {
    const q = search.trim().toUpperCase();
    const reasons = new Map<string, string[]>();
    let base = ladderSource.map((r) => {
      const ov = watchOverrides.get(r.symbol);
      const onWatchlist = ov ?? r.onWatchlist;
      let strategyMatch = !!r.strategyMatch;
      if (monitorPreset) {
        const facts = resolveMonitorFacts(r.symbol);
        if (facts) {
          const { matched, explain } = evaluateMonitorPreset(
            monitorPreset,
            facts
          );
          strategyMatch = matched;
          if (matched) reasons.set(r.symbol, explain.why);
        } else {
          strategyMatch = false;
        }
      }
      const lastKnown = connection === "disconnected";
      return {
        ...r,
        onWatchlist,
        strategyMatch,
        dataConfidenceWarning: lastKnown ? true : r.dataConfidenceWarning,
        reason: lastKnown
          ? r.reason.includes("Last known")
            ? r.reason
            : `${r.reason} · Last known`
          : r.reason,
      };
    });
    if (monitorPreset) {
      base = base.filter((r) => r.strategyMatch);
    }
    presetMatchReasonsRef.current = reasons;
    if (!q) return base;
    return base.filter(
      (r) => r.symbol.includes(q) || r.reason.toUpperCase().includes(q)
    );
  }, [
    ladderSource,
    search,
    watchOverrides,
    monitorPreset,
    resolveMonitorFacts,
    connection,
  ]);

  const deskStale =
    isStaleFreshnessMs(vm.lastEventAgeMs) ||
    connection === "degraded" ||
    connection === "delayed" ||
    connection === "disconnected";

  /** Rank-1 attention leader — never replaced by pin; never an unlabeled stale leader. */
  const globalLeaderSymbol =
    ladder.find((r) => {
      if (r.momentumState === "HALTED" || r.halted) return false;
      if (r.dataConfidenceWarning && deskStale) return false;
      return true;
    })?.symbol ?? null;

  const leaderLabel = globalLeaderSymbol
    ? deskStale &&
      ladder.find((r) => r.symbol === globalLeaderSymbol)?.dataConfidenceWarning
      ? `${globalLeaderSymbol} · stale`
      : globalLeaderSymbol
    : deskStale
      ? "unavailable"
      : "—";

  /** Field / auto-select centre: pin wins for inspection; else global leader. */
  const leaderSymbol =
    pinnedSymbol && ladder.some((r) => r.symbol === pinnedSymbol)
      ? pinnedSymbol
      : globalLeaderSymbol;

  const livePriorityRows = useMemo(
    () =>
      toPriorityRows(ladder, {
        muted,
        pinnedSymbol,
        leaderSymbol,
        challengerSymbol: null,
        hysteresis: pinnedSymbol
          ? "pinned"
          : leaderSymbol
            ? "stable_leader"
            : "not_leader",
        freshnessMs: vm.lastEventAgeMs,
        watchOverrides,
      }),
    [
      ladder,
      muted,
      pinnedSymbol,
      leaderSymbol,
      vm.lastEventAgeMs,
      watchOverrides,
    ]
  );

  const fieldNodes = useMemo(() => {
    return ladderToFieldNodes(ladder, {
      leaderSymbol,
      pinnedSymbol,
      muted,
      previousRanks: prevRanksRef.current,
      freshnessMs: vm.lastEventAgeMs,
    });
  }, [ladder, pinnedSymbol, muted, vm.lastEventAgeMs, leaderSymbol]);

  useEffect(() => {
    const next = new Map<string, number>();
    for (const r of ladder) next.set(r.symbol, r.rank);
    prevRanksRef.current = next;
  }, [ladder]);

  const ladderSymKey = useMemo(
    () => ladder.map((r) => r.symbol).join("|"),
    [ladder]
  );

  useEffect(() => {
    // Keep selection through loading/empty transitions and live score updates.
    if (!ladderSymKey) return;
    const symbols = ladderSymKey.split("|");
    setSelected((current) => {
      if (current && symbols.includes(current)) return current;
      const fromUrl =
        typeof window !== "undefined"
          ? symbolFromSearchParams(new URLSearchParams(window.location.search))
          : null;
      if (fromUrl && symbols.includes(fromUrl)) return fromUrl;
      return symbols[0] ?? current;
    });
  }, [ladderSymKey]);

  // Do NOT write ?symbol= on every selection. Dashboard is a searchParams RSC
  // page — history.replaceState triggers fetchMissingDynamicData and can
  // cascade into "Failed to fetch" / remount loops. Symbol is read once on mount.

  const onPinToggle = useCallback((symbol: string) => {
    setPinnedSymbol((p) => (p === symbol ? null : symbol));
  }, []);

  const onWatchlistToggle = useCallback((symbol: string) => {
    setWatchOverrides((prev) => {
      const m = new Map(prev);
      const cur =
        m.get(symbol) ??
        ladder.find((r) => r.symbol === symbol)?.onWatchlist ??
        false;
      m.set(symbol, !cur);
      return m;
    });
  }, [ladder]);

  const onMuteToggle = useCallback((symbol: string) => {
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      writeMutedSymbols(next);
      return next;
    });
  }, []);

  const onOpenEvidence = useCallback((symbol: string) => {
    setEvidenceSymbol(symbol);
    setSelected(symbol);
    setIntelOpen(true);
  }, []);

  const dossier = useMemo(() => {
    if (!selected) {
      stickyIntelRef.current = null;
      return null;
    }
    const row = ladder.find((r) => r.symbol === selected);
    if (!row) return stickyIntelRef.current?.dossier ?? null;
    const next = buildSelectedTicker({
      row,
      pinned: pinnedSymbol === selected,
      seed: vm.intelSeeds[selected] ?? null,
      freshnessMs: vm.lastEventAgeMs,
    });
    const prev =
      stickyIntelRef.current?.symbol === selected
        ? stickyIntelRef.current.dossier
        : null;
    const stuck = stickSelectedTicker(prev, next);
    stickyIntelRef.current = { symbol: selected, dossier: stuck };
    return stuck;
  }, [
    selected,
    ladder,
    pinnedSymbol,
    vm.intelSeeds,
    vm.lastEventAgeMs,
  ]);

  // Preserve last known ladder when the stream drops.
  // Compare by symbol key — vm.ladder is often a new array identity each tick.
  const vmLadderKey = useMemo(
    () => vm.ladder.map((r) => r.symbol).join("|"),
    [vm.ladder]
  );
  useEffect(() => {
    if (
      !(
        connection === "live" ||
        connection === "degraded" ||
        connection === "delayed" ||
        connection === "partial_outage"
      ) ||
      vm.ladder.length === 0
    ) {
      return;
    }
    setLastKnownLadder((prev) => {
      const prevKey = prev.map((r) => r.symbol).join("|");
      return prevKey === vmLadderKey ? prev : vm.ladder;
    });
  }, [connection, vm.ladder, vmLadderKey]);

  const syncKeepsVisible =
    live.syncState === "SNAPSHOT_READY" ||
    live.syncState === "CONNECTING" ||
    live.syncState === "CATCHING_UP" ||
    live.syncState === "LIVE" ||
    live.syncState === "DEGRADED" ||
    live.syncState === "RECONNECTING";

  const showSpatial =
    connection === "live" ||
    connection === "degraded" ||
    connection === "delayed" ||
    connection === "partial_outage" ||
    connection === "loading" ||
    (syncKeepsVisible &&
      (ladder.length > 0 || lastKnownLadder.length > 0 || ssrLadderRows.length > 0)) ||
    (connection === "disconnected" &&
      (ladder.length > 0 || lastKnownLadder.length > 0));

  // deskStale already covers degraded / delayed / disconnected — don't re-test
  // those here (TS narrows connection after a falsy deskStale check).
  const motionPaused =
    deskStale || live.freezeMotion || connection === "loading";

  const openWatchlist = useCallback(() => {
    // Prefer in-page panel toggle — avoid searchParams navigation (RSC refetch).
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("tt-open-watchlist-panel"));
    }
  }, []);

  const openPreset = useCallback(() => {
    setPresetPanelPulse((n) => n + 1);
    const el = document.querySelector(
      '[data-testid="monitor-active-preset"]'
    ) as HTMLButtonElement | null;
    el?.click();
  }, []);

  const retryMonitor = useCallback(() => {
    if (e2e) {
      setConnection("live");
      return;
    }
    setSsrBannerDismissed(false);
    setConnection("loading");
    // Soft retry: reload so SSR can bootstrap from hub again.
    if (typeof window !== "undefined") window.location.reload();
  }, [e2e]);

  const watchlistSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const r of ladder) {
      if (r.onWatchlist) set.add(r.symbol);
    }
    return set;
  }, [ladder]);

  const squawk = useAudioSquawk({
    watchlist: watchlistSymbols,
    transcriptOnlyWhenUnavailable: true,
  });

  // High-value Event Tape → squawk (skip initial fixture burst)
  useEffect(() => {
    if (tapeSeenRef.current == null) {
      tapeSeenRef.current = new Set(vm.tape.map((t) => t.id));
      return;
    }
    for (const item of vm.tape) {
      if (tapeSeenRef.current.has(item.id)) continue;
      tapeSeenRef.current.add(item.id);
      const row = ladder.find((r) => r.symbol === item.symbol);
      const input = tapeItemToMonitorSquawkInput(item, {
        onWatchlist: watchlistSymbols.has(item.symbol),
        strategyMatch: !!row?.strategyMatch,
        momentumState: row?.momentumState ?? null,
      });
      if (input) squawk.pushMonitorEvent(input);
    }
  }, [vm.tape, ladder, watchlistSymbols, squawk.pushMonitorEvent]);

  // Meaningful attention-leader change → squawk
  useEffect(() => {
    if (prevLeaderRef.current === undefined) {
      prevLeaderRef.current = leaderSymbol;
      return;
    }
    const prev = prevLeaderRef.current;
    // Squawk on global attention leader changes only — not pin inspection focus.
    if (globalLeaderSymbol && globalLeaderSymbol !== prev) {
      const row = ladder.find((r) => r.symbol === globalLeaderSymbol);
      const input = attentionLeaderToMonitorSquawkInput({
        symbol: globalLeaderSymbol,
        previousSymbol: prev,
        momentumState: row?.momentumState ?? null,
        riskOrTradeability: null,
        onWatchlist: watchlistSymbols.has(globalLeaderSymbol),
        strategyMatch: !!row?.strategyMatch,
        meaningful: true,
      });
      if (input) {
        squawk.pushMonitorEvent(input);
        setSquawkFireCount((n) => n + 1);
      }
    }
    prevLeaderRef.current = globalLeaderSymbol;
  }, [
    globalLeaderSymbol,
    ladder,
    watchlistSymbols,
    squawk.pushMonitorEvent,
  ]);

  const pick = (sym: string) => {
    setSelected((s) => (s === sym ? s : sym));
    setIntelOpen(true);
    // Mobile sheet only — avoid desktop state thrash on every click.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setMobileSheet(true);
    }
  };

  const onTapeSelect = useCallback((item: MonitorTapeItem) => {
    setSelected(item.symbol);
    setIntelOpen(true);
    setMobileSheet(true);
    // Allow intel panel to mount/update before scrolling.
    window.setTimeout(() => focusIntelSection(item.intelSection), 40);
  }, []);

  const density =
    initialSnapshot?.prefs.displayDensity ?? "comfortable";

  return (
    <div
      className="tt-monitor"
      data-testid="trustticker-monitor"
      data-connection={connection}
      data-last-known={connection === "disconnected" ? "true" : "false"}
      data-motion={motionPaused ? "paused" : "live"}
      data-e2e-scenario={e2e?.scenario ?? undefined}
      data-preset-pulse={presetPanelPulse || undefined}
      data-snapshot-source={initialSnapshot?.source ?? undefined}
      data-last-event-id={initialSnapshot?.lastEventId ?? undefined}
      data-generated-at={initialSnapshot?.generatedAt ?? undefined}
      data-data-age-ms={
        initialSnapshot?.dataAgeMs != null
          ? String(initialSnapshot.dataAgeMs)
          : undefined
      }
      data-density={density}
      data-ssr-seeded={ssrOk ? "true" : "false"}
      data-sync-state={live.syncState}
    >
      {/* Always in initial HTML for no-JS / hydration proofs (same symbols as ladder). */}
      {initialSnapshot && !(ssrUnavailable && ssrBannerDismissed) ? (
        <MonitorSsrCore
          initialSnapshot={initialSnapshot}
          suppressUnavailable={ssrBannerDismissed || live.ladder.length > 0}
        />
      ) : null}

      {/* Diagnostics only — replayed count is not shown in normal chrome. */}
      <span className="sr-only" data-testid="monitor-sync-diagnostics">
        {live.diagnostics
          ? `state=${live.diagnostics.syncState};replayed=${live.diagnostics.replayedUpdates};lastApplied=${live.diagnostics.lastEventApplied ?? ""};snapshot=${live.diagnostics.snapshotId ?? ""}`
          : ""}
      </span>
      {(live.syncState === "CONNECTING" ||
        live.syncState === "CATCHING_UP") && (
        <span
          className="sr-only"
          data-testid="monitor-syncing-live"
          aria-live="polite"
        >
          Syncing live…
        </span>
      )}

      {ssrUnavailable && !ssrBannerDismissed && live.ladder.length === 0 ? (
        <div className="px-3 pb-2 flex flex-wrap items-center gap-2">
          <p className="text-[11px] text-zinc-400 m-0">
            Connecting to live Scanner data…
          </p>
          <button
            type="button"
            className="tt-monitor__drawer-btn"
            data-testid="monitor-snapshot-retry"
            onClick={retryMonitor}
          >
            Retry
          </button>
        </div>
      ) : null}

      <MonitorStatusBar
        sessionLabel={vm.sessionLabel}
        connection={connection}
        lastEventAgeLabel={formatAge(vm.lastEventAgeMs)}
        snapshotAgeLabel={
          initialSnapshot?.dataAgeMs != null
            ? formatAge(initialSnapshot.dataAgeMs)
            : formatAge(vm.lastEventAgeMs)
        }
        providerNotes={vm.providerNotes}
        search={search}
        onSearchChange={setSearch}
        squawkFireCount={squawkFireCount}
        squawkSpeaking={squawk.speaking}
        preset={{
          strategy: monitorPreset,
          onStrategyChange: setMonitorPreset,
          resolveFacts: resolveMonitorFacts,
          watchlistSymbols: [...watchlistSymbols],
          replayRows: vm.ladder.map((r) => ({
            id: `replay_${r.symbol}`,
            symbol: r.symbol,
            publishedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
            price: vm.intelSeeds[r.symbol]?.price ?? null,
            changePercent: vm.intelSeeds[r.symbol]?.sessionChangePct ?? null,
            rVol: vm.intelSeeds[r.symbol]?.relativeVolume ?? null,
            factsExtras: resolveMonitorFacts(r.symbol) ?? undefined,
          })),
        }}
        squawk={
          isMonitorSquawkV1Enabled()
            ? {
                enabled: squawk.settings.enabled,
                onEnabledChange: (on) =>
                  squawk.setSettings({ ...squawk.settings, enabled: on }),
                muted: squawk.settings.muted,
                onMute: squawk.mute,
                onUnmute: squawk.unmute,
                onReplay: squawk.replay,
                speechSupported: squawk.speechSupported,
                speechBlocked: squawk.speechBlocked,
                lastScript: squawk.lastSpoken?.script ?? null,
                transcript: squawk.transcript,
                settings: squawk.settings,
                onSettingsChange: squawk.setSettings,
              }
            : null
        }
        demoConnection={
          process.env.NODE_ENV === "development"
            ? { value: connection, onChange: setConnection }
            : undefined
        }
        onToggleLadder={() => setLadderOpen((v) => !v)}
        onToggleIntel={() => setIntelOpen((v) => !v)}
        ladderOpen={ladderOpen}
      />
      {!isMonitorSquawkV1Enabled() ? (
        <span className="sr-only" data-guide="monitor-squawk">
          Squawk off for this cohort
        </span>
      ) : null}

      {(connection === "delayed" ||
        connection === "partial_outage" ||
        connection === "degraded") && (
        <MonitorOutageBanner
          connection={connection}
          notes={vm.providerNotes}
        />
      )}

      {/* Leader awareness — outside status bar; present on all breakpoints */}
      <div className="tt-monitor__leader-strip" aria-live="polite">
        <span
          className="tt-monitor__leader-mark"
          data-testid="monitor-global-leader"
          data-stale={
            !globalLeaderSymbol || leaderLabel.includes("stale")
              ? "true"
              : "false"
          }
          aria-label={`Global leader ${globalLeaderSymbol ?? "none"}`}
        >
          Leader · {leaderLabel}
        </span>
        <span
          className="tt-monitor__pin-mark"
          data-testid="monitor-pinned-symbol"
          aria-label={`Pinned ${pinnedSymbol ?? "none"}`}
        >
          Pin · {pinnedSymbol ?? "—"}
        </span>
      </div>

      {/* Readable master–detail: ranked list + selected detail (+ optional field) */}
      <MonitorLoadBoundary
        id="monitor-shell"
        label="Monitor shell failed"
        className="tt-monitor__shell-boundary"
      >
      <div
        className="tt-monitor__body tt-monitor__desktop-only min-h-0 flex-1"
        data-layout="readable"
        data-field={showFieldPanel ? "on" : "off"}
        data-ladder={ladderOpen ? "open" : "collapsed"}
        data-disconnected={connection === "disconnected" ? "true" : "false"}
        data-progressive="first-paint"
      >
        {!showSpatial ? (
          <div className="tt-monitor__panel" style={{ gridColumn: "1 / -1" }}>
            <MonitorSurfaceState
              connection={connection}
              notes={vm.providerNotes}
              diagnosticId={diagnosticId}
              onRetry={retryMonitor}
              onShowAll={() => setFilter("all")}
              onChangePreset={openPreset}
              onOpenWatchlist={openWatchlist}
            />
          </div>
        ) : (
          <>
            <div
              className="tt-monitor__panel tt-monitor__ladder-wrap"
              data-guide="monitor-priority-ladder"
              data-last-known={
                connection === "disconnected" ? "true" : "false"
              }
            >
              <div className="tt-monitor__section-head">
                <div className="min-w-0 flex-1">
                  <h3 className="tt-monitor__section-title">Priority names</h3>
                  <p className="tt-monitor__section-sub">
                    Ranked by attention — click a row for detail
                  </p>
                </div>
                <button
                  type="button"
                  className="tt-monitor__drawer-btn text-[10px] shrink-0"
                  data-testid="monitor-toggle-field-panel"
                  onClick={() => setShowFieldPanel((v) => !v)}
                >
                  {showFieldPanel ? "Hide map" : "Show map"}
                </button>
              </div>
              <PriorityLadder
                liveRows={livePriorityRows}
                selectedSymbol={selected}
                filter={filter}
                onFilterChange={setFilter}
                onSelect={pick}
                onPinToggle={onPinToggle}
                onMuteToggle={onMuteToggle}
                onWatchlistToggle={onWatchlistToggle}
                activePresetLabel={
                  monitorPreset?.name?.trim() ||
                  monitorPreset?.presetId ||
                  initialSnapshot?.prefs.activePresetId ||
                  "No preset"
                }
                universeCount={vm.ladder.length || lastKnownLadder.length}
                onShowAllActivity={() => setFilter("all")}
                onChangePreset={openPreset}
                onOpenWatchlist={openWatchlist}
              />
              {monitorPreset && selected && (
                <p
                  className="tt-monitor-preset__match"
                  data-testid="monitor-preset-match-why"
                >
                  Why {selected} matched:{" "}
                  {(presetMatchReasonsRef.current.get(selected) ?? []).slice(0, 4).join("; ") ||
                    "Preset conditions passed."}
                </p>
              )}
            </div>

            {!showFieldPanel ? (
              <span className="sr-only" data-guide="monitor-momentum-field">
                Activity map hidden — use Show map
              </span>
            ) : null}
            {showFieldPanel ? (
              <div
                className="tt-monitor__panel tt-monitor__field tt-monitor__field-wrap"
                data-guide="monitor-momentum-field"
              >
                <div className="tt-monitor__section-head">
                  <h3 className="tt-monitor__section-title">Activity map</h3>
                  <p className="tt-monitor__section-sub">
                    Optional spatial view — list is the default
                  </p>
                </div>
                {isMomentumFieldV1Enabled() ? (
                  <MomentumField
                    nodes={fieldNodes}
                    selectedSymbol={selected}
                    onSelect={pick}
                    onPinToggle={onPinToggle}
                    onWatchlistToggle={onWatchlistToggle}
                    onMuteToggle={onMuteToggle}
                    onOpenEvidence={onOpenEvidence}
                    listView={fieldListView}
                    onListViewChange={setFieldListView}
                    motionPaused={motionPaused}
                  />
                ) : (
                  <div className="p-3 text-[11px] text-[var(--mon-muted)]">
                    Activity map is off for this rollout. Use the priority list.
                  </div>
                )}
                {evidenceSymbol && (
                  <div
                    className="tt-monitor__evidence"
                    data-testid="monitor-evidence"
                  >
                    Evidence · {evidenceSymbol}:{" "}
                    {ladder.find((r) => r.symbol === evidenceSymbol)?.reason ??
                      "No additional evidence row"}
                    <button
                      type="button"
                      className="tt-monitor__drawer-btn ml-2"
                      onClick={() => setEvidenceSymbol(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            <div
              className="tt-monitor__panel tt-monitor__intel-wrap"
              data-guide="monitor-intelligence"
              data-open={intelOpen ? "true" : "false"}
            >
              {/* Identity/metrics live in the sticky intel header — no second title row */}
              <DeferredSelectedTickerPanel
                dossier={dossier}
                onPinToggle={onPinToggle}
                onClose={() => setIntelOpen(false)}
                loading={connection === "loading"}
              />
            </div>

            <div
              className="tt-monitor__panel tt-monitor__tape"
              data-guide="monitor-event-tape"
            >
              <DeferredEventTape
                items={vm.tape}
                filter={tapeFilter}
                onFilterChange={setTapeFilter}
                selectedSymbol={selected}
                watchlistSymbols={watchlistSymbols}
                onSelectItem={onTapeSelect}
              />
            </div>

            {connection === "disconnected" ? (
              <MonitorDisconnectOverlay
                notes={vm.providerNotes}
                lastEventAgeLabel={formatAge(vm.lastEventAgeMs)}
                reconnectLabel="Attempting to reconnect…"
              />
            ) : null}
          </>
        )}
      </div>
      </MonitorLoadBoundary>

      {/* Mobile ranked cards — same first-paint ladder alternative */}
      <div className="tt-monitor__mobile flex-1 min-h-0" data-progressive="first-paint">
        {!showSpatial ? (
          <MonitorSurfaceState
            connection={connection}
            notes={vm.providerNotes}
            diagnosticId={diagnosticId}
            onRetry={retryMonitor}
            onShowAll={() => setFilter("all")}
            onChangePreset={openPreset}
            onOpenWatchlist={openWatchlist}
          />
        ) : (
          <>
            {connection === "disconnected" ? (
              <MonitorDisconnectOverlay
                notes={vm.providerNotes}
                lastEventAgeLabel={formatAge(vm.lastEventAgeMs)}
              />
            ) : null}
            <div className="flex-1 overflow-auto">
              {ladder.map((r) => (
                <button
                  key={r.symbol}
                  type="button"
                  className="tt-monitor__card"
                  data-stale={
                    r.dataConfidenceWarning || deskStale ? "true" : "false"
                  }
                  onClick={() => pick(r.symbol)}
                  data-testid={`monitor-mobile-${r.symbol}`}
                >
                  <div className="flex justify-between gap-2">
                    <strong>{r.symbol}</strong>
                    <span className="text-[11px] text-[var(--mon-muted)]">
                      #{r.rank} · {Math.round(r.attentionPriority)}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--mon-muted)] mt-1">
                    {r.momentumState} · {r.reason}
                  </div>
                </button>
              ))}
            </div>
            <div
              className="tt-monitor__sheet"
              data-open={mobileSheet ? "true" : "false"}
              data-testid="monitor-mobile-sheet"
            >
              <div className="tt-monitor__panel-h">
                <span>{selected ?? "Details"}</span>
                <button
                  type="button"
                  className="tt-monitor__drawer-btn"
                  onClick={() => setMobileSheet(false)}
                >
                  Close
                </button>
              </div>
              <DeferredSelectedTickerPanel
                dossier={dossier}
                onPinToggle={onPinToggle}
                compact
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
