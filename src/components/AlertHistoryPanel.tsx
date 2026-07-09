"use client";

import { useEffect, useState } from "react";
import { Bell, Mail, MessageSquare, Smartphone } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";

interface AlertRow {
  id: string;
  channel: string;
  status: string;
  createdAt: string;
  symbol: string;
  headline: string;
  changePercent: number | null;
}

const CHANNEL_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  discord: MessageSquare,
  sms: Smartphone,
  email: Mail,
  push: Bell,
};

export function AlertHistoryPanel({ className }: { className?: string }) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/alerts/history")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.alerts) setAlerts(d.alerts);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-xs text-zinc-600">Loading alert history…</p>;
  }

  if (alerts.length === 0) {
    return (
      <p className={cn("text-xs text-zinc-600", className)}>
        No alerts sent yet. Enable Discord, email, SMS, or push in your alert rules.
      </p>
    );
  }

  return (
    <div className={cn("space-y-1.5 max-h-48 overflow-y-auto", className)}>
      {alerts.map((a) => {
        const Icon = CHANNEL_ICON[a.channel] ?? Bell;
        return (
          <div
            key={a.id}
            className="flex items-start gap-2 text-[11px] py-1.5 px-2 rounded bg-zinc-900/40 border border-zinc-800/60"
          >
            <Icon className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-zinc-200">{a.symbol}</span>
                <span
                  className={cn(
                    "font-mono",
                    (a.changePercent ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {formatPercent(a.changePercent ?? 0)}
                </span>
                <span className="text-zinc-600 capitalize">{a.channel}</span>
                <span
                  className={cn(
                    "text-[9px] px-1 rounded",
                    a.status === "sent" ? "text-emerald-500" : "text-red-400"
                  )}
                >
                  {a.status}
                </span>
              </div>
              <p className="text-zinc-500 line-clamp-1">{a.headline}</p>
            </div>
            <span className="text-[9px] text-zinc-600 shrink-0 tabular-nums">
              {new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
