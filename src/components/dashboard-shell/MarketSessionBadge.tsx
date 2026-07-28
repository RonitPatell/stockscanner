"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Compact US equity session label for the top bar. */
export function MarketSessionBadge({ className }: { className?: string }) {
  const [label, setLabel] = useState("—");

  useEffect(() => {
    const tick = () => setLabel(sessionLabel(new Date()));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <span
      className={cn(
        "hidden sm:inline-flex items-center rounded border border-zinc-700/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400",
        className
      )}
      title="US equity session (America/New_York)"
    >
      {label}
    </span>
  );
}

function sessionLabel(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const dow = map.weekday ?? "";
  if (dow === "Sat" || dow === "Sun") return "Weekend";
  const h = Number(map.hour === "24" ? "0" : map.hour);
  const m = Number(map.minute);
  const mins = h * 60 + m;
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "Premarket";
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "Regular";
  if (mins >= 16 * 60 && mins < 20 * 60) return "After-hours";
  return "Overnight";
}
