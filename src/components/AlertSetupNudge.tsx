"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { Button } from "./ui/button";

export function AlertSetupNudge() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("tt-alert-nudge-dismissed") === "1") {
      setDismissed(true);
      return;
    }
    void fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const hasChannel =
          (data.discordAlertsEnabled && data.discordWebhookConfigured) ||
          data.emailAlertsEnabled ||
          data.smsAlertsEnabled ||
          data.pushSubscription?.configured;
        const subscribed =
          data.subscriptionStatus === "active" || data.subscriptionStatus === "trialing";
        if (subscribed && !hasChannel) setShow(true);
      })
      .catch(() => {});
  }, []);

  if (!show || dismissed) return null;

  const dismiss = () => {
    sessionStorage.setItem("tt-alert-nudge-dismissed", "1");
    setDismissed(true);
  };

  return (
    <div className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2">
      <div className="flex items-start gap-2 flex-1">
        <Bell className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-amber-200">Alerts not configured</p>
          <p className="text-[11px] text-amber-200/70">
            Speed only matters if it reaches you. Enable Discord, email, or push in Settings.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link href="/settings">
          <Button size="sm" className="text-xs h-7">
            Set up alerts
          </Button>
        </Link>
        <button type="button" onClick={dismiss} className="text-zinc-500 hover:text-zinc-300 p-1">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
