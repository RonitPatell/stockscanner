"use client";

import { useEffect, useId, useRef } from "react";
import { tradingViewSymbol } from "@/lib/chart-links";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    TradingView?: {
      widget: new (opts: Record<string, unknown>) => unknown;
    };
  }
}

let tvScriptPromise: Promise<void> | null = null;

/** Call early (dashboard mount) so the first chart paint is faster. */
export function prefetchTradingViewScript(): void {
  void loadTradingViewScript().catch(() => {});
}

function loadTradingViewScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.TradingView) return Promise.resolve();
  if (tvScriptPromise) return tvScriptPromise;
  tvScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-tt-tradingview="1"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("tv script")));
      if (window.TradingView) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.dataset.ttTradingview = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("tv script"));
    document.head.appendChild(script);
  });
  return tvScriptPromise;
}

/**
 * Live TradingView chart for the selected ticker (1-minute, dark theme).
 * Informational only — not a broker and not investment advice.
 */
export function TradingViewMiniChart({
  symbol,
  exchange,
  className,
  height = 280,
  /** Show range controls + scroll/pinch zoom affordances for desk use. */
  interactive = false,
}: {
  symbol: string;
  exchange?: string | null;
  className?: string;
  height?: number;
  interactive?: boolean;
}) {
  const reactId = useId().replace(/:/g, "");
  const containerId = `tt_tv_${reactId}`;
  const hostRef = useRef<HTMLDivElement>(null);
  const tvSymbol = tradingViewSymbol(symbol, exchange);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host || !symbol) return;

    host.innerHTML = "";
    const mount = document.createElement("div");
    mount.id = containerId;
    mount.style.height = "100%";
    mount.style.minHeight = `${height}px`;
    host.appendChild(mount);

    void loadTradingViewScript()
      .then(() => {
        if (cancelled || !window.TradingView) return;
        // eslint-disable-next-line no-new
        new window.TradingView.widget({
          autosize: true,
          symbol: tvSymbol,
          interval: "1",
          timezone: "America/New_York",
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#0b0f14",
          enable_publishing: false,
          hide_top_toolbar: false,
          hide_side_toolbar: !interactive,
          hide_legend: false,
          save_image: false,
          container_id: containerId,
          withdateranges: interactive,
          allow_symbol_change: false,
          details: false,
          hotlist: false,
          calendar: false,
          studies: ["Volume@tv-basicstudies"],
        });
      })
      .catch(() => {
        if (!cancelled && host) {
          host.innerHTML =
            '<p class="px-2 py-3 text-[11px] text-[var(--text-muted)]">Chart failed to load — use the Chart button for TradingView.</p>';
        }
      });

    return () => {
      cancelled = true;
      if (host) host.innerHTML = "";
    };
  }, [symbol, tvSymbol, containerId, height, interactive]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded border border-[var(--border)] bg-[#0b0f14] h-full min-h-0",
        className
      )}
      data-testid="tradingview-mini-chart"
    >
      <div ref={hostRef} className="h-full w-full" style={{ minHeight: height }} />
    </div>
  );
}
