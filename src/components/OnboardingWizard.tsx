"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, Bell, Check, ChevronRight, Star, X, Zap } from "lucide-react";
import { Button } from "./ui/button";
import { DEFAULT_ALERT_RULES, type AlertRule } from "@/lib/alert-rules";
import { PushNotifyToggle } from "./PushNotifyToggle";

const SUGGESTED_TICKERS = ["NVDA", "AMD", "TSLA", "MRNA", "SOFI", "PLTR"];

interface OnboardingWizardProps {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const pathname = usePathname();
  const [step, setStep] = useState(0);
  const [watchlist, setWatchlist] = useState<string[]>(["NVDA", "AMD"]);
  const [discordWebhook, setDiscordWebhook] = useState("");
  const [discordEnabled, setDiscordEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const toggleTicker = (sym: string) => {
    setWatchlist((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym].slice(0, 12)
    );
  };

  const finish = async () => {
    setSaving(true);
    try {
      const rules: AlertRule[] = DEFAULT_ALERT_RULES.map((r) => ({
        ...r,
        channels: [
          ...(discordEnabled && discordWebhook ? (["discord"] as const) : []),
          ...(emailEnabled ? (["email"] as const) : []),
          ...(discordEnabled ? (["push"] as const) : []),
        ],
      }));

      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          watchlist,
          discordWebhook: discordWebhook || undefined,
          discordAlertsEnabled: discordEnabled && !!discordWebhook,
          emailAlertsEnabled: emailEnabled,
          emailBriefEnabled: true,
          alertRules: rules,
        }),
      });

      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });

      onComplete();
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    {
      title: "Welcome to TrustTicker Pro",
      body: "Your desk grades news GO / WATCH / SKIP using the story and how the company is trading — so you take fewer bad trades. 60-second setup.",
      icon: Zap,
    },
    {
      title: "Build your watchlist",
      body: "Pick tickers you trade most. Alerts and briefs focus on these names first.",
      icon: Star,
    },
    {
      title: "Never miss a catalyst",
      body: "Enable alert channels. Discord for your desk, email + push when you're away.",
      icon: Bell,
    },
  ];

  const Icon = steps[step].icon;

  if (pathname !== "/dashboard") {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 pt-20">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        aria-hidden
      />
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl overflow-hidden ring-1 ring-black/40">
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-900/80">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1 w-8 rounded-full ${i <= step ? "bg-emerald-500" : "bg-zinc-700"}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => void finish()}
            className="text-zinc-500 hover:text-zinc-300"
            title="Skip setup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center mb-4">
            <Icon className="w-5 h-5 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold mb-2">{steps[step].title}</h2>
          <p className="text-sm text-zinc-400 mb-6 leading-relaxed">{steps[step].body}</p>

          {step === 1 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {SUGGESTED_TICKERS.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => toggleTicker(sym)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-mono border transition-colors ${
                    watchlist.includes(sym)
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {watchlist.includes(sym) && <Check className="w-3 h-3 inline mr-1" />}
                  {sym}
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 mb-4">
              <label className="block text-xs text-zinc-500">
                Discord webhook (optional)
                <input
                  value={discordWebhook}
                  onChange={(e) => setDiscordWebhook(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={discordEnabled}
                  onChange={(e) => setDiscordEnabled(e.target.checked)}
                />
                Discord alerts
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => setEmailEnabled(e.target.checked)}
                />
                Email alerts to your account email
              </label>
              <PushNotifyToggle />
            </div>
          )}

          <div className="flex justify-between gap-3">
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            ) : (
              <span />
            )}
            {step < steps.length - 1 ? (
              <Button type="button" onClick={() => setStep(step + 1)} disabled={step === 1 && watchlist.length === 0}>
                Continue <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button type="button" onClick={() => void finish()} disabled={saving}>
                {saving ? "Saving…" : "Launch scanner"}
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
