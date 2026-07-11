"use client";

import { useEffect, useState } from "react";
import { Radio, ShieldAlert, Megaphone, Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";

const FEED = [
  {
    symbol: "MRNA",
    change: "+16.94%",
    headline: "Phase 3 data · FDA fast track",
    play: "LONG",
    playClass: "text-emerald-400 border-emerald-500/40",
    tag: "Anti-FOMO 82",
  },
  {
    symbol: "ABCD",
    change: "-22.1%",
    headline: "ATM offering announced · dilution",
    play: "SKIP",
    playClass: "text-amber-400 border-amber-500/40",
    tag: "Dilution radar",
  },
  {
    symbol: "NVDA",
    change: "+4.8%",
    headline: "Hyperscaler contract · sympathy map live",
    play: "WATCH",
    playClass: "text-cyan-400 border-cyan-500/40",
    tag: "Under 3m ingest",
  },
];

const CALLS = [
  { who: "Marcus", sym: "BJDX", bias: "long", ago: "12s" },
  { who: "Priya", sym: "GCTK", bias: "avoid", ago: "41s" },
  { who: "Derek", sym: "SOBR", bias: "short", ago: "1m" },
];

export function HeroProductStage() {
  const [tick, setTick] = useState(0);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    let pulseTimer: ReturnType<typeof setTimeout> | undefined;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setPulse(true);
      clearTimeout(pulseTimer);
      pulseTimer = setTimeout(() => setPulse(false), 600);
    }, 3200);
    return () => {
      clearInterval(id);
      clearTimeout(pulseTimer);
    };
  }, []);

  const active = FEED[tick % FEED.length];
  const call = CALLS[tick % CALLS.length];

  return (
    <div className="relative w-full">
      <div className="absolute -inset-6 sm:-inset-10 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.22),transparent_65%)] pointer-events-none blur-2xl" />
      <div className="absolute inset-x-8 -bottom-8 h-24 bg-emerald-500/20 blur-3xl pointer-events-none" />

      <div
        className={cn(
          "relative rounded-2xl border border-zinc-700/70 bg-zinc-950/90 backdrop-blur-xl overflow-hidden shadow-[0_40px_120px_-40px_rgba(16,185,129,0.45)] hero-stage-float",
          pulse && "hero-stage-pulse"
        )}
      >
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800/90 bg-zinc-950/90">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
          </div>
          <span className="text-[10px] text-zinc-500 font-mono ml-2 tracking-wide">
            trustticker · prop desk
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            LIVE WIRE
          </span>
        </div>

        <div className="grid lg:grid-cols-12 min-h-[300px]">
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-zinc-800/80 p-3 space-y-2 bg-zinc-950/40">
            <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-500 font-semibold flex items-center gap-1.5 mb-2">
              <Crosshair className="w-3 h-3 text-emerald-500" /> Session plan
            </div>
            <MiniChip label="3 setups" tone="emerald" />
            <MiniChip label="2 skips · dilution" tone="amber" />
            <div className="pt-2 text-[9px] uppercase tracking-[0.14em] text-zinc-500 font-semibold flex items-center gap-1.5">
              <Megaphone className="w-3 h-3 text-orange-400" /> Call board
            </div>
            <div
              key={call.sym + tick}
              className="hero-row-in flex items-center gap-2 text-[11px] py-1.5 px-2 rounded-lg border border-orange-500/25 bg-orange-500/5"
            >
              <span className="text-zinc-500 w-12 truncate">{call.who}</span>
              <span className="font-mono font-bold text-white">{call.sym}</span>
              <span
                className={cn(
                  "text-[9px] uppercase",
                  call.bias === "long"
                    ? "text-emerald-400"
                    : call.bias === "short"
                      ? "text-red-400"
                      : "text-amber-400"
                )}
              >
                {call.bias}
              </span>
              <span className="ml-auto text-[9px] text-zinc-600 font-mono">{call.ago}</span>
            </div>
            <div className="pt-1 text-[9px] uppercase tracking-[0.14em] text-zinc-500 font-semibold flex items-center gap-1.5">
              <ShieldAlert className="w-3 h-3 text-amber-400" /> Dilution radar
            </div>
            <div className="text-[11px] text-amber-200/90 px-2 py-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5">
              Offering trap flagged · skip FOMO
            </div>
          </div>

          <div className="lg:col-span-8 p-3 space-y-2">
            <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-500 font-semibold flex items-center gap-1.5 mb-1">
              <Radio className="w-3 h-3 text-emerald-500" /> Catalyst feed · action playbooks
            </div>
            {FEED.map((row, i) => {
              const isActive = row.symbol === active.symbol;
              return (
                <div
                  key={row.symbol}
                  className={cn(
                    "rounded-xl border p-3 transition-all duration-500",
                    isActive
                      ? "border-emerald-500/40 bg-emerald-500/8 scale-[1.01] shadow-[0_0_40px_-12px_rgba(16,185,129,0.5)]"
                      : "border-zinc-800/80 bg-zinc-900/40 opacity-70"
                  )}
                >
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono font-bold text-sm tracking-tight">{row.symbol}</span>
                    <span
                      className={cn(
                        "font-mono text-xs",
                        row.change.startsWith("-") ? "text-red-400" : "text-emerald-400"
                      )}
                    >
                      {row.change}
                    </span>
                    <span
                      className={cn(
                        "text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-semibold",
                        row.playClass
                      )}
                    >
                      {row.play}
                    </span>
                    <span className="text-[9px] text-zinc-500 ml-auto">{row.tag}</span>
                  </div>
                  <p className="text-xs text-zinc-300">{row.headline}</p>
                  {isActive && (
                    <div className="mt-2 h-0.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 hero-scan-bar" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniChip({ label, tone }: { label: string; tone: "emerald" | "amber" }) {
  return (
    <div
      className={cn(
        "text-[11px] px-2 py-1.5 rounded-lg border",
        tone === "emerald"
          ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-300"
          : "border-amber-500/25 bg-amber-500/5 text-amber-200"
      )}
    >
      {label}
    </div>
  );
}
