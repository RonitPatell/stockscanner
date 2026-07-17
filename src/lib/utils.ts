import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMarketCap(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toLocaleString()}`;
}

export function formatFloat(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString();
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatPrice(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${value.toFixed(2)}`;
}

/** Stable clock format for SSR + client (avoids Node vs browser locale drift). */
export function formatClockTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function timeAgo(date: Date | string, now: Date | number = Date.now()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const nowMs = typeof now === "number" ? now : now.getTime();
  const seconds = Math.floor((nowMs - d.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function getSentimentColor(score: number | null | undefined): string {
  if (score == null) return "text-zinc-400";
  if (score >= 60) return "text-emerald-400";
  if (score >= 20) return "text-green-400";
  if (score <= -60) return "text-red-400";
  if (score <= -20) return "text-orange-400";
  return "text-zinc-400";
}

export function getSentimentBg(score: number | null | undefined): string {
  if (score == null) return "bg-zinc-800";
  if (score >= 60) return "bg-emerald-500/20 border-emerald-500/30";
  if (score >= 20) return "bg-green-500/20 border-green-500/30";
  if (score <= -60) return "bg-red-500/20 border-red-500/30";
  if (score <= -20) return "bg-orange-500/20 border-orange-500/30";
  return "bg-zinc-800 border-zinc-700";
}

export function getChangeColor(change: number | null | undefined): string {
  if (change == null) return "text-zinc-400";
  if (change > 0) return "text-emerald-400";
  if (change < 0) return "text-red-400";
  return "text-zinc-400";
}

/** Only allow http(s) links from external feed sources (blocks javascript:/data: etc.). */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
