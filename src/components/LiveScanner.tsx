"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Radio,
  Filter,
  RefreshCw,
  Search,
  Sun,
  Moon,
  Volume2,
} from "lucide-react";
import { CatalystCard } from "./CatalystCard";
import { DisclaimerBanner } from "./DisclaimerBanner";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import type { CatalystItem, ScannerFilters } from "@/types";
import { CATALYST_TYPES } from "@/types";
import { cn } from "@/lib/utils";

export function LiveScanner() {
  const [catalysts, setCatalysts] = useState<CatalystItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<ScannerFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const prevIdsRef = useRef<Set<string>>(new Set());

  const fetchCatalysts = useCallback(async () => {
    try {
      const res = await fetch("/api/catalysts");
      if (!res.ok) return;
      const data: CatalystItem[] = await res.json();

      const currentIds = new Set(data.map((c) => c.id));
      const freshIds = new Set<string>();
      currentIds.forEach((id) => {
        if (!prevIdsRef.current.has(id)) freshIds.add(id);
      });

      if (freshIds.size > 0 && prevIdsRef.current.size > 0) {
        setNewIds(freshIds);
        if (soundEnabled) playAlertSound();
        setTimeout(() => setNewIds(new Set()), 5000);
      }

      prevIdsRef.current = currentIds;
      setCatalysts(data);
      setLastUpdate(new Date());
      setConnected(true);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, [soundEnabled]);

  useEffect(() => {
    fetchCatalysts();
    const interval = setInterval(fetchCatalysts, 30000);
    return () => clearInterval(interval);
  }, [fetchCatalysts]);

  useEffect(() => {
    const eventSource = new EventSource("/api/catalysts/stream");
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "update" && Array.isArray(data.catalysts)) {
          setCatalysts(data.catalysts);
          setLastUpdate(new Date());
          setConnected(true);
        }
      } catch { /* ignore */ }
    };
    eventSource.onerror = () => setConnected(false);
    return () => eventSource.close();
  }, []);

  const filtered = catalysts.filter((c) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!c.symbol.toLowerCase().includes(q) && !c.headline.toLowerCase().includes(q)) return false;
    }
    if (filters.minSentiment != null && (c.sentimentScore ?? 0) < filters.minSentiment) return false;
    if (filters.maxSentiment != null && (c.sentimentScore ?? 0) > filters.maxSentiment) return false;
    if (filters.premarketOnly && !c.isPremarket) return false;
    if (filters.minUrgency != null && (c.urgencyScore ?? 0) < filters.minUrgency) return false;
    if (filters.catalystTypes?.length && !filters.catalystTypes.includes(c.catalystType || "")) return false;
    return true;
  });

  const isPremarket = catalysts.some((c) => c.isPremarket);

  return (
    <div className="space-y-4">
      {/* Scanner header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Live Catalyst Scanner</h1>
            <div className="flex items-center gap-1.5">
              <span className={cn("w-2 h-2 rounded-full", connected ? "bg-emerald-400 animate-pulse" : "bg-red-400")} />
              <span className="text-xs text-zinc-500">{connected ? "LIVE" : "Reconnecting..."}</span>
            </div>
          </div>
          {lastUpdate && (
            <p className="text-xs text-zinc-600 mt-1">
              Last update: {lastUpdate.toLocaleTimeString()}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isPremarket && (
            <Badge variant="urgent">
              <Sun className="w-3 h-3" /> Premarket Active
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "Mute alerts" : "Enable sound alerts"}
          >
            <Volume2 className={cn("w-4 h-4", soundEnabled ? "text-emerald-400" : "text-zinc-600")} />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4" /> Filters
          </Button>
          <Button variant="secondary" size="sm" onClick={fetchCatalysts}>
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search symbol or headline..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              value={filters.search || ""}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterChip
              active={filters.premarketOnly}
              onClick={() => setFilters({ ...filters, premarketOnly: !filters.premarketOnly })}
            >
              <Sun className="w-3 h-3" /> Premarket Only
            </FilterChip>
            <FilterChip
              active={filters.minUrgency === 70}
              onClick={() => setFilters({ ...filters, minUrgency: filters.minUrgency === 70 ? undefined : 70 })}
            >
              <Radio className="w-3 h-3" /> High Urgency
            </FilterChip>
            <FilterChip
              active={filters.minSentiment === 40}
              onClick={() => setFilters({ ...filters, minSentiment: filters.minSentiment === 40 ? undefined : 40 })}
            >
              Bullish Only
            </FilterChip>
            {CATALYST_TYPES.slice(0, 6).map((type) => (
              <FilterChip
                key={type.id}
                active={filters.catalystTypes?.includes(type.id)}
                onClick={() => {
                  const types = filters.catalystTypes || [];
                  const next = types.includes(type.id)
                    ? types.filter((t) => t !== type.id)
                    : [...types, type.id];
                  setFilters({ ...filters, catalystTypes: next.length ? next : undefined });
                }}
              >
                {type.icon} {type.label}
              </FilterChip>
            ))}
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Active Catalysts" value={filtered.length} />
        <StatCard
          label="Bullish"
          value={filtered.filter((c) => (c.sentimentScore ?? 0) >= 20).length}
          color="text-emerald-400"
        />
        <StatCard
          label="Bearish"
          value={filtered.filter((c) => (c.sentimentScore ?? 0) <= -20).length}
          color="text-red-400"
        />
        <StatCard
          label="High Urgency"
          value={filtered.filter((c) => (c.urgencyScore ?? 0) >= 70).length}
          color="text-amber-400"
        />
      </div>

      <DisclaimerBanner compact />

      {/* Catalyst feed */}
      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-zinc-900/50 animate-pulse border border-zinc-800" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <Moon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No catalysts match your filters</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((catalyst) => (
            <CatalystCard
              key={catalyst.id}
              catalyst={catalyst}
              isNew={newIds.has(catalyst.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
        active
          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
          : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600"
      )}
    >
      {children}
    </button>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={cn("text-2xl font-bold font-mono", color || "text-white")}>{value}</div>
    </div>
  );
}

function playAlertSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.1;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.3);
  } catch { /* audio not available */ }
}
