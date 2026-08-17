"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResearchOverviewDto } from "@/lib/research/types";
import { AddToPortfolioButton } from "./AddToPortfolioButton";
import { BusinessChangeFingerprintGrid } from "./BusinessChangeFingerprintGrid";
import { CompanyStatePanel } from "./CompanyStatePanel";
import { SinceLastResearchedPanel } from "./SinceLastResearchedPanel";
import type { BusinessChangeFingerprint } from "@/lib/company-state/fingerprint";
import type { CompanyStateReport } from "@/lib/company-state";
import { useResearchReadiness } from "./DatasetStatusBanner";
import { overviewEmptyCopy } from "@/lib/company-readiness/ui-copy";

function Block({
  title,
  children,
  testId,
}: {
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="rounded-lg border border-zinc-800 bg-zinc-900/35 px-3.5 py-3 space-y-1.5"
      data-testid={testId}
    >
      <h3 className="text-[10px] uppercase tracking-wide text-zinc-500">
        {title}
      </h3>
      <div className="text-[13px] text-zinc-200 leading-relaxed">{children}</div>
    </section>
  );
}

export function ResearchOverview({
  symbol,
  entitled,
  onOpenTab,
}: {
  symbol: string;
  entitled: boolean;
  onOpenTab?: (tab: string) => void;
}) {
  const [overview, setOverview] = useState<ResearchOverviewDto | null>(null);
  const [fingerprint, setFingerprint] = useState<BusinessChangeFingerprint | null>(null);
  const [companyState, setCompanyState] = useState<CompanyStateReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const { healthMap, statusMap } = useResearchReadiness(symbol, entitled);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/research/${encodeURIComponent(symbol)}/overview`,
          { credentials: "include" }
        );
        if (!res.ok) {
          if (!cancelled) {
            setOverview(null);
            setError("Could not load overview.");
          }
          return;
        }
        const data = (await res.json()) as { overview?: ResearchOverviewDto };
        if (!cancelled) {
          const next = data.overview ?? null;
          setOverview(next);
          if (!next) setError("Could not load overview.");
        }
        const fpRes = await fetch(
          `/api/ticker/${encodeURIComponent(symbol)}/business-fingerprint`
        );
        if (fpRes.ok && !cancelled) {
          const fpData = (await fpRes.json()) as {
            fingerprint?: BusinessChangeFingerprint;
          };
          setFingerprint(fpData.fingerprint ?? null);
        }
        const stateRes = await fetch(
          `/api/ticker/${encodeURIComponent(symbol)}/company-state`
        );
        if (stateRes.ok && !cancelled) {
          const stateData = (await stateRes.json()) as { report?: CompanyStateReport };
          setCompanyState(stateData.report ?? null);
        }
      } catch {
        if (!cancelled) {
          setOverview(null);
          setError("Could not load overview.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol, attempt]);

  if (loading) {
    return (
      <p className="text-sm text-zinc-500" data-testid="research-overview-loading">
        Loading overview…
      </p>
    );
  }
  if (error || !overview) {
    return (
      <div
        className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300 flex flex-wrap items-center justify-between gap-3"
        role="alert"
        data-testid="research-overview-error"
      >
        <span>{error ?? "Overview unavailable."}</span>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="rounded-md border border-red-400/40 px-2.5 py-1 text-xs font-medium text-red-100 hover:bg-red-500/20"
        >
          Retry
        </button>
      </div>
    );
  }

  const inPortfolio = overview.monitoring?.inPortfolio === true;

  return (
    <div className="space-y-4" data-testid="research-overview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            Company
          </p>
          <h2 className="font-mono text-2xl font-semibold text-emerald-400">
            {overview.symbol}
          </h2>
          <p className="mt-1 text-[12px] text-zinc-500 max-w-lg">
            A quick snapshot of this company. Plain numbers and events. Not buy or
            sell advice.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AddToPortfolioButton
            symbol={overview.symbol}
            entitled={entitled}
            initiallyInPortfolio={inPortfolio}
          />
          <Link
            href={`/ticker/${encodeURIComponent(overview.symbol)}`}
            className="text-[11px] text-zinc-400 hover:text-emerald-400 inline-flex items-center gap-1"
            data-testid="research-open-public-hub"
          >
            Public hub <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      <SinceLastResearchedPanel
        symbol={overview.symbol}
        entitled={entitled}
        onOpenWhatChanged={() => onOpenTab?.("what-changed")}
      />

      <Block title="How the business looks" testId="research-overview-company-state">
        <CompanyStatePanel
          report={companyState}
          onOpenTab={onOpenTab}
          emptyMessage={overviewEmptyCopy(
            "companyState",
            healthMap.COMPANY_STATE,
            statusMap?.COMPANY_STATE ?? null
          )}
        />
      </Block>

      <Block title="Trend snapshot" testId="research-overview-fingerprint">
        <BusinessChangeFingerprintGrid
          fingerprint={fingerprint}
          emptyMessage={overviewEmptyCopy(
            "fingerprint",
            healthMap.FINANCIALS,
            statusMap?.FINANCIALS ?? null
          )}
        />
      </Block>

      <section data-testid="research-overview-what-changed">
        <h3 className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2">
          What changed
        </h3>
        {overview.latestEvents.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {overviewEmptyCopy("events", healthMap.COMPANY_EVENTS, statusMap?.COMPANY_EVENTS ?? null)}
          </p>
        ) : (
          <ul className="space-y-2">
            {overview.latestEvents.map((ev) => (
              <li key={ev.id}>
                <button
                  type="button"
                  className="text-left text-[13px] text-zinc-200 hover:underline w-full"
                  onClick={() => onOpenTab?.("what-changed")}
                >
                  <span className="text-zinc-500 text-[11px]">{ev.whenLabel}</span>
                  <span className="block">{ev.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="research-overview-my-research">
        <h3 className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2">
          My research
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
        <Block title="Monitoring status" testId="research-overview-monitoring">
          {!entitled ? (
            <span className="text-zinc-500">
              Active plan required to see portfolio monitoring status.
            </span>
          ) : overview.monitoring?.inPortfolio ? (
            <span>
              Monitored
              {overview.monitoring.label
                ? ` · ${overview.monitoring.label}`
                : ""}
              {overview.monitoring.monitoredSince
                ? ` since ${new Date(overview.monitoring.monitoredSince).toLocaleDateString()}`
                : ""}
            </span>
          ) : (
            <span className="text-zinc-400">Not in your Portfolio yet.</span>
          )}
        </Block>

        <Block title="Capital Risk" testId="research-overview-capital">
          {overview.capitalRisk ? (
            <button
              type="button"
              className="text-left hover:underline"
              onClick={() => onOpenTab?.("capital")}
            >
              <span
                className={cn(
                  "uppercase text-[11px] tracking-wide",
                  overview.capitalRisk.status === "elevated"
                    ? "text-amber-300"
                    : "text-zinc-200"
                )}
              >
                {overview.capitalRisk.status}
              </span>
              {overview.capitalRisk.summary ? (
                <span className="block text-zinc-400 mt-1 text-[12px]">
                  {overview.capitalRisk.summary}
                </span>
              ) : null}
            </button>
          ) : (
            <span className="text-zinc-500">
              {overviewEmptyCopy("capital", healthMap.CAPITAL, statusMap?.CAPITAL ?? null)}
            </span>
          )}
        </Block>

        <Block title="Thesis health" testId="research-overview-thesis">
          {!entitled ? (
            <span className="text-zinc-500">
              Thesis is private and requires an active plan.
            </span>
          ) : overview.thesis?.hasThesis ? (
            <button
              type="button"
              className="text-left hover:underline"
              onClick={() => onOpenTab?.("thesis")}
            >
              <span className="capitalize">{overview.thesis.healthStatus}</span>
              {overview.thesis.summaryLine ? (
                <span className="block text-zinc-400 mt-1 text-[12px]">
                  {overview.thesis.summaryLine}
                </span>
              ) : null}
            </button>
          ) : (
            <span className="text-zinc-400">No thesis on this name yet.</span>
          )}
        </Block>

        <Block title="Latest financial delta" testId="research-overview-financial">
          {overview.financialDelta ? (
            <button
              type="button"
              className="text-left hover:underline"
              onClick={() => onOpenTab?.("financials")}
            >
              {overview.financialDelta.metricLabel}:{" "}
              {overview.financialDelta.changeLabel}
              {overview.financialDelta.periodLabel
                ? ` (${overview.financialDelta.periodLabel})`
                : ""}
            </button>
          ) : (
            <span className="text-zinc-500">
              {overviewEmptyCopy("financial", healthMap.FINANCIALS, statusMap?.FINANCIALS ?? null)}
            </span>
          )}
        </Block>

        <Block title="Latest insider" testId="research-overview-insider">
          {overview.latestInsider ? (
            <button
              type="button"
              className="text-left hover:underline"
              onClick={() => onOpenTab?.("insiders")}
            >
              {overview.latestInsider.summary}
              <span className="block text-[11px] text-zinc-500 mt-1">
                Filed {new Date(overview.latestInsider.filedAt).toLocaleDateString()}
              </span>
            </button>
          ) : (
            <span className="text-zinc-500">
              {overviewEmptyCopy("insider", healthMap.INSIDERS, statusMap?.INSIDERS ?? null)}
            </span>
          )}
        </Block>

        <Block title="Latest ownership" testId="research-overview-ownership">
          {overview.latestOwnership ? (
            <button
              type="button"
              className="text-left hover:underline"
              onClick={() => onOpenTab?.("ownership")}
            >
              {overview.latestOwnership.summary}
              <span className="block text-[11px] text-zinc-500 mt-1">
                Filed{" "}
                {new Date(overview.latestOwnership.filedAt).toLocaleDateString()}
              </span>
            </button>
          ) : (
            <span className="text-zinc-500">
              {overviewEmptyCopy("ownership", healthMap.OWNERSHIP, statusMap?.OWNERSHIP ?? null)}
            </span>
          )}
        </Block>

        <Block title="Latest filing" testId="research-overview-filing">
          {overview.latestFiling ? (
            <button
              type="button"
              className="text-left hover:underline"
              onClick={() => onOpenTab?.("filings")}
            >
              {overview.latestFiling.formHint
                ? `${overview.latestFiling.formHint} · `
                : ""}
              {overview.latestFiling.title}
            </button>
          ) : (
            <span className="text-zinc-500">
              {overviewEmptyCopy("filing", healthMap.FILINGS, statusMap?.FILINGS ?? null)}
            </span>
          )}
        </Block>

        <Block title="EDGAR" testId="research-overview-edgar">
          <a
            href={overview.identity.edgarSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
          >
            Search EDGAR <ExternalLink className="w-3 h-3" />
          </a>
        </Block>
        </div>
      </section>
    </div>
  );
}
