"use client";

import Link from "next/link";
import {
  MarketMonitor,
  POPOUT_PANELS,
  type PopoutPanelId,
} from "@/components/MarketMonitor";
import { LiveQuoteProvider } from "@/components/LiveQuoteProvider";
import { LogoMark } from "@/components/Logo";

export function PopoutWorkspace({ panel }: { panel: PopoutPanelId }) {
  const meta = POPOUT_PANELS[panel];

  return (
    <LiveQuoteProvider>
      <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
        <header className="shrink-0 h-10 px-3 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/95">
          <div className="flex items-center gap-2 min-w-0">
            <LogoMark className="w-5 h-5 shrink-0" />
            <span className="text-xs font-semibold truncate">
              Trust<span className="text-emerald-400">Ticker</span>
              <span className="text-zinc-600 font-normal"> · {meta.title}</span>
            </span>
          </div>
          <Link
            href="/dashboard"
            className="text-[10px] text-zinc-500 hover:text-emerald-400 shrink-0"
          >
            Back to scanner
          </Link>
        </header>
        <main className="flex-1 min-h-0 p-0">
          <MarketMonitor solo={panel} className="h-full" />
        </main>
      </div>
    </LiveQuoteProvider>
  );
}
