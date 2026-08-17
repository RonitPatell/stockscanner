"use client";

import { useCallback, useEffect, useState } from "react";
import { WhatChangedFeedClient } from "@/components/ticker/WhatChangedFeedClient";
import { ThesisPanel } from "@/components/ticker/thesis/ThesisPanel";
import { FinancialsTab } from "@/components/ticker/FinancialsTab";
import { CapitalTab } from "@/components/ticker/CapitalTab";
import { InsidersTab } from "@/components/ticker/InsidersTab";
import { OwnershipTab } from "@/components/ticker/OwnershipTab";
import { FilingsTab } from "@/components/ticker/FilingsTab";
import { TickerPlaceholderTab } from "@/components/ticker/TickerPlaceholderTab";
import { ResearchOverview } from "./ResearchOverview";
import { ResearchPersonalizedGate } from "./ResearchPersonalizedGate";
import {
  DatasetStatusBanner,
  useResearchReadiness,
} from "./DatasetStatusBanner";
import type { TickerTabId } from "@/lib/ticker-tabs";
import type { CompanyWhatChangedFeed } from "@/lib/ticker-what-changed/types";
import type { QuarterlyDeltaReport } from "@/lib/metrics/quarterly-delta";
import type { CapitalRiskReport } from "@/lib/capital-risk/types";
import type { DilutionTimelineEvent } from "@/lib/dilution/timeline";
import type { InsiderReport } from "@/lib/insider/get-report";
import type { OwnershipReport } from "@/lib/ownership/get-report";
import type { FilingsReport } from "@/lib/filings/get-report";

type LoadState<T> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: T };

function Loading({ label }: { label: string }) {
  return (
    <p
      className="text-sm text-zinc-500 py-6"
      data-testid="research-tab-loading"
      aria-busy="true"
      aria-live="polite"
    >
      Loading {label}…
    </p>
  );
}

function useResearchResource<T>(
  key: string,
  load: () => Promise<T | null>
): { state: LoadState<T>; retry: () => void } {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      try {
        const data = await load();
        if (cancelled) return;
        if (data == null) setState({ status: "error" });
        else setState({ status: "ready", data });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
    // intentionally re-run on attempt + key
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load closed over symbol
  }, [key, attempt]);

  return { state, retry };
}

export function ResearchTabPanels({
  symbol,
  tab,
  entitled,
  accessState = "expired",
  onOpenTab,
}: {
  symbol: string;
  tab: TickerTabId;
  entitled: boolean;
  accessState?: import("@/lib/subscription").AccessState;
  onOpenTab: (tab: TickerTabId) => void;
}) {
  if (tab === "overview") {
    return (
      <ResearchOverview
        symbol={symbol}
        entitled={entitled}
        onOpenTab={(t) => onOpenTab(t as TickerTabId)}
      />
    );
  }

  if (tab === "thesis") {
    if (!entitled) {
      return (
        <ResearchPersonalizedGate
          state={
            accessState === "trial_eligible" || accessState === "anonymous"
              ? accessState
              : "expired"
          }
          nextPath={`/dashboard?view=research&symbol=${encodeURIComponent(symbol)}&tab=thesis`}
          title="Thesis requires an active plan"
          body="Your investment thesis and notes stay private. Subscribe to write and monitor conditions."
        />
      );
    }
    return <ThesisPanel symbol={symbol} />;
  }

  if (tab === "what-changed") {
    return <WhatChangedPanel symbol={symbol} entitled={entitled} />;
  }

  if (tab === "financials") {
    return <FinancialsPanel symbol={symbol} entitled={entitled} />;
  }

  if (tab === "capital") {
    return <CapitalPanel symbol={symbol} entitled={entitled} />;
  }

  if (tab === "insiders") {
    return <InsidersPanel symbol={symbol} entitled={entitled} />;
  }

  if (tab === "ownership") {
    return <OwnershipPanel symbol={symbol} entitled={entitled} />;
  }

  if (tab === "filings") {
    return <FilingsPanel symbol={symbol} entitled={entitled} />;
  }

  if (tab === "timeline") {
    return <TimelinePanel symbol={symbol} entitled={entitled} />;
  }

  return null;
}

function WhatChangedPanel({
  symbol,
  entitled,
}: {
  symbol: string;
  entitled: boolean;
}) {
  const { state, retry } = useResearchResource(
    `wc:${symbol}`,
    async () => {
      const res = await fetch(
        `/api/ticker/${encodeURIComponent(symbol)}/what-changed?window=30d`,
        { credentials: "include" }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { feed?: CompanyWhatChangedFeed };
      return data.feed ?? null;
    }
  );
  if (state.status === "loading") return <Loading label="What Changed" />;
  if (state.status === "error") {
    return (
      <TickerPlaceholderTab
        testId="research-what-changed-error"
        title="What Changed"
        body="What Changed could not be loaded for this symbol right now."
        onRetry={retry}
      />
    );
  }
  return (
    <WhatChangedFeedClient
      symbol={symbol}
      initialFeed={state.data}
      entitled={entitled && state.data.meta.accessMode === "entitled"}
    />
  );
}

function FinancialsPanel({
  symbol,
  entitled,
}: {
  symbol: string;
  entitled: boolean;
}) {
  const { statusMap, reasons, retry: retryReady } = useResearchReadiness(
    symbol,
    entitled
  );
  const fin = statusMap?.FINANCIALS ?? null;
  const { state, retry } = useResearchResource(
    `fin:${symbol}:${fin === "READY" ? "ready" : "pending"}`,
    async () => {
      const res = await fetch(
        `/api/ticker/${encodeURIComponent(symbol)}/quarterly-delta`
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { report?: QuarterlyDeltaReport };
      return data.report ?? null;
    }
  );
  if (state.status === "loading") return <Loading label="Financials" />;
  if (state.status === "error") {
    return (
      <TickerPlaceholderTab
        testId="research-financials-error"
        title="Financials"
        body="Financial deltas could not be loaded right now."
        onRetry={retry}
      />
    );
  }
  const hideEmptyTable =
    state.data.empty &&
    (fin === "PROCESSING" ||
      fin === "ERROR" ||
      fin === "MISSING" ||
      fin === "UNSUPPORTED");
  return (
    <div className="space-y-4">
      <DatasetStatusBanner
        dataset="FINANCIALS"
        status={fin}
        reason={reasons.FINANCIALS}
        onRetry={retryReady}
        testId="research-financials-status"
      />
      {hideEmptyTable ? null : <FinancialsTab report={state.data} />}
    </div>
  );
}

function CapitalPanel({
  symbol,
  entitled,
}: {
  symbol: string;
  entitled: boolean;
}) {
  const { statusMap, reasons, retry: retryReady } = useResearchReadiness(
    symbol,
    entitled
  );
  const { state, retry } = useResearchResource(
    `cap:${symbol}:${statusMap?.CAPITAL === "READY" ? "ready" : "pending"}`,
    async () => {
      const res = await fetch(
        `/api/ticker/${encodeURIComponent(symbol)}/capital-risk`
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        report?: CapitalRiskReport;
        timeline?: DilutionTimelineEvent[];
      };
      if (!data.report) return null;
      return {
        report: data.report,
        timeline: Array.isArray(data.timeline) ? data.timeline : [],
      };
    }
  );
  if (state.status === "loading") return <Loading label="Capital Risk" />;
  if (state.status === "error") {
    return (
      <TickerPlaceholderTab
        testId="research-capital-error"
        title="Capital"
        body="Capital Risk could not be loaded right now."
        onRetry={retry}
      />
    );
  }
  return (
    <div className="space-y-4">
      <DatasetStatusBanner
        dataset="CAPITAL"
        status={statusMap?.CAPITAL ?? null}
        reason={reasons.CAPITAL}
        onRetry={retryReady}
        testId="research-capital-status"
      />
      <CapitalTab report={state.data.report} timeline={state.data.timeline} />
    </div>
  );
}

function InsidersPanel({
  symbol,
  entitled,
}: {
  symbol: string;
  entitled: boolean;
}) {
  const { statusMap, reasons, retry: retryReady } = useResearchReadiness(
    symbol,
    entitled
  );
  const ins = statusMap?.INSIDERS ?? null;
  const { state, retry } = useResearchResource(
    `ins:${symbol}:${ins === "READY" ? "ready" : "pending"}`,
    async () => {
      const res = await fetch(
        `/api/ticker/${encodeURIComponent(symbol)}/insiders`
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { report?: InsiderReport };
      return data.report ?? null;
    }
  );
  if (state.status === "loading") return <Loading label="Insiders" />;
  if (state.status === "error") {
    return (
      <TickerPlaceholderTab
        testId="research-insiders-error"
        title="Insiders"
        body="Insider data could not be loaded right now."
        onRetry={retry}
      />
    );
  }
  const hide = state.data.empty && (ins === "PROCESSING" || ins === "ERROR");
  return (
    <div className="space-y-4">
      <DatasetStatusBanner
        dataset="INSIDERS"
        status={ins}
        reason={reasons.INSIDERS}
        onRetry={retryReady}
        testId="research-insiders-status"
      />
      {hide ? null : <InsidersTab report={state.data} />}
    </div>
  );
}

function OwnershipPanel({
  symbol,
  entitled,
}: {
  symbol: string;
  entitled: boolean;
}) {
  const { statusMap, reasons, retry: retryReady } = useResearchReadiness(
    symbol,
    entitled
  );
  const own = statusMap?.OWNERSHIP ?? null;
  const { state, retry } = useResearchResource(
    `own:${symbol}:${own === "READY" ? "ready" : "pending"}`,
    async () => {
      const res = await fetch(
        `/api/ticker/${encodeURIComponent(symbol)}/ownership`
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { report?: OwnershipReport };
      return data.report ?? null;
    }
  );
  if (state.status === "loading") return <Loading label="Ownership" />;
  if (state.status === "error") {
    return (
      <TickerPlaceholderTab
        testId="research-ownership-error"
        title="Ownership"
        body="Ownership data could not be loaded right now."
        onRetry={retry}
      />
    );
  }
  const hide = state.data.empty && (own === "PROCESSING" || own === "ERROR");
  return (
    <div className="space-y-4">
      <DatasetStatusBanner
        dataset="OWNERSHIP"
        status={own}
        reason={reasons.OWNERSHIP}
        onRetry={retryReady}
        testId="research-ownership-status"
      />
      {hide ? null : <OwnershipTab report={state.data} />}
    </div>
  );
}

function FilingsPanel({
  symbol,
  entitled,
}: {
  symbol: string;
  entitled: boolean;
}) {
  const { statusMap, reasons, retry: retryReady } = useResearchReadiness(
    symbol,
    entitled
  );
  const fil = statusMap?.FILINGS ?? null;
  const { state, retry } = useResearchResource(
    `fil:${symbol}:${fil === "READY" ? "ready" : "pending"}`,
    async () => {
      const res = await fetch(
        `/api/ticker/${encodeURIComponent(symbol)}/filings`
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { report?: FilingsReport };
      return data.report ?? null;
    }
  );
  if (state.status === "loading") return <Loading label="Filings" />;
  if (state.status === "error") {
    return (
      <TickerPlaceholderTab
        testId="research-filings-error"
        title="Filings"
        body="Filings could not be loaded right now."
        onRetry={retry}
      />
    );
  }
  const hide = state.data.empty && (fil === "PROCESSING" || fil === "ERROR");
  return (
    <div className="space-y-4">
      <DatasetStatusBanner
        dataset="FILINGS"
        status={fil}
        reason={reasons.FILINGS}
        onRetry={retryReady}
        testId="research-filings-status"
      />
      {hide ? null : <FilingsTab report={state.data} />}
    </div>
  );
}

function TimelinePanel({
  symbol,
  entitled,
}: {
  symbol: string;
  entitled: boolean;
}) {
  const { state, retry } = useResearchResource(
    `tl:${symbol}:${entitled ? "1" : "0"}`,
    async () => {
      const res = await fetch(
        `/api/ticker/${encodeURIComponent(symbol)}/what-changed?window=1y&showAll=1`,
        { credentials: "include" }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { feed?: CompanyWhatChangedFeed };
      const f = data.feed ?? null;
      if (!f) return null;
      if (!entitled) {
        for (const c of f.cards) c.thesisRelevance = null;
        f.meta.hasThesis = false;
        f.meta.accessMode = "public";
      }
      return f;
    }
  );

  if (state.status === "loading") return <Loading label="Timeline" />;
  if (state.status === "error") {
    return (
      <TickerPlaceholderTab
        testId="research-timeline-error"
        title="Timeline"
        body="Timeline could not be loaded right now."
        onRetry={retry}
      />
    );
  }

  const cards = [...state.data.cards].sort(
    (a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()
  );

  return (
    <section className="space-y-3" data-testid="research-timeline">
      <header>
        <h2 className="text-sm font-semibold text-zinc-200">Timeline</h2>
        <p className="text-[12px] text-zinc-500 mt-1">
          Chronological company changes from TrustTicker events. Thesis notes
          are never shown on public surfaces.
        </p>
      </header>
      {cards.length === 0 ? (
        <p className="text-[13px] text-zinc-500">No timeline events yet.</p>
      ) : (
        <ol className="relative border-l border-zinc-800 ml-2 space-y-4 pl-4">
          {cards.map((c) => (
            <li key={c.id} className="relative">
              <span className="absolute -left-[1.35rem] top-1.5 h-2 w-2 rounded-full bg-zinc-600" />
              <time className="text-[10px] text-zinc-500">{c.whenLabel}</time>
              <p className="text-[13px] text-zinc-200 mt-0.5">{c.whatHappened}</p>
              <p className="text-[11px] text-zinc-500 capitalize">
                {c.category}
                {c.significance?.level ? ` · ${c.significance.level}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
