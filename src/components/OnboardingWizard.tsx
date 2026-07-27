"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  Crosshair,
  ListPlus,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  ALERT_STYLE_PRESETS,
  FOCUS_STARTER_WATCHLISTS,
  type AlertStyle,
  type OnboardingFocus,
} from "@/lib/onboarding";

const FOCUS_OPTIONS: { id: OnboardingFocus; label: string; blurb: string }[] = [
  {
    id: "small_cap",
    label: "Small-cap catalysts",
    blurb: "Movers, floats, and tape-driven names",
  },
  {
    id: "biotech",
    label: "Biotech",
    blurb: "FDA, data readouts, clinical news",
  },
  {
    id: "large_cap",
    label: "Large-cap news",
    blurb: "Mega-cap earnings and product news",
  },
  {
    id: "custom",
    label: "Custom",
    blurb: "Build your own list from scratch",
  },
];

function isStarterFocus(
  f: OnboardingFocus | null
): f is Exclude<OnboardingFocus, "custom"> {
  return f === "small_cap" || f === "biotech" || f === "large_cap";
}

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkipped?: () => void;
}

export function OnboardingWizard({ onComplete, onSkipped }: OnboardingWizardProps) {
  const pathname = usePathname();
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState<OnboardingFocus | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [alertStyle, setAlertStyle] = useState<AlertStyle>("confirmed");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  useEffect(() => {
    if (focus && focus !== "custom") {
      setWatchlist(FOCUS_STARTER_WATCHLISTS[focus]);
    } else if (focus === "custom") {
      setWatchlist([]);
    }
  }, [focus]);

  const skip = async () => {
    setSaving(true);
    try {
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skip" }),
      });
      onSkipped?.();
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  const saveFocus = async () => {
    if (!focus) return;
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "focus", focus }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error || "Could not save focus");
        return;
      }
      setStep(1);
    } finally {
      setSaving(false);
    }
  };

  const saveWatchlist = async () => {
    setError("");
    const symbols =
      watchlist.length >= 5
        ? watchlist
        : customInput
            .split(/[,\s]+/)
            .map((s) => s.trim().toUpperCase())
            .filter((s) => /^[A-Z]{1,5}$/.test(s));

    const merged = [...new Set([...watchlist, ...symbols])];
    if (merged.length < 5 && !isStarterFocus(focus)) {
      setError("Add at least 5 symbols or use a starter watchlist");
      return;
    }

    setSaving(true);
    try {
      const useStarter = merged.length < 5 && isStarterFocus(focus);
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "watchlist",
          symbols: merged,
          useStarter: Boolean(useStarter),
          focus,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error || "Could not save watchlist");
        return;
      }
      if (useStarter && isStarterFocus(focus)) {
        setWatchlist(FOCUS_STARTER_WATCHLISTS[focus]);
      } else {
        setWatchlist(merged);
      }
      setStep(2);
    } finally {
      setSaving(false);
    }
  };

  const saveAlertsAndTest = async () => {
    setError("");
    setSaving(true);
    try {
      const styleRes = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "alerts", style: alertStyle }),
      });
      if (!styleRes.ok) {
        const d = await styleRes.json().catch(() => ({}));
        setError((d as { error?: string }).error || "Could not save alert style");
        return;
      }

      setTestStatus("sending");
      const testRes = await fetch("/api/alerts/test", { method: "POST" });
      if (!testRes.ok) {
        setTestStatus("failed");
        const d = await testRes.json().catch(() => ({}));
        setError(
          (d as { error?: string }).error ||
            "Test alert failed — you can retry from Settings"
        );
        // Still mark step progress partially
        await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "complete", completed: true }),
        });
        onComplete();
        return;
      }
      setTestStatus("sent");
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_alert_done" }),
      });
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  const toggleTicker = (sym: string) => {
    setWatchlist((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym].slice(0, 20)
    );
  };

  if (pathname !== "/dashboard") {
    return null;
  }

  const stepMeta = [
    { title: "Trading focus", icon: Crosshair },
    { title: "Watchlist", icon: ListPlus },
    { title: "Alerts", icon: Bell },
  ];
  const Icon = stepMeta[step].icon;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 pt-20">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" aria-hidden />
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl overflow-hidden ring-1 ring-black/40">
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-900/80">
          <div className="flex gap-1">
            {stepMeta.map((_, i) => (
              <span
                key={i}
                className={`h-1 w-8 rounded-full ${i <= step ? "bg-emerald-500" : "bg-zinc-700"}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => void skip()}
            className="text-zinc-500 hover:text-zinc-300 text-xs flex items-center gap-1"
            title="Skip setup — checklist stays visible"
            disabled={saving}
          >
            Skip <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center mb-4">
            <Icon className="w-5 h-5 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold mb-1">{stepMeta[step].title}</h2>
          <p className="text-sm text-zinc-400 mb-5">
            {step === 0 && "What do you trade most? We seed a starter list you can edit."}
            {step === 1 && "Add at least five symbols, or keep the starter watchlist."}
            {step === 2 && "Choose Early, Confirmed, or Risk-only — then send a test alert."}
          </p>

          {step === 0 && (
            <div className="grid gap-2 mb-4">
              {FOCUS_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFocus(opt.id)}
                  className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    focus === opt.id
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  <div className="text-sm font-medium text-zinc-100">{opt.label}</div>
                  <div className="text-xs text-zinc-500">{opt.blurb}</div>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="mb-4 space-y-3">
              {isStarterFocus(focus) && (
                <div>
                  <p className="text-xs text-zinc-500 mb-2">Starter watchlist</p>
                  <div className="flex flex-wrap gap-2">
                    {FOCUS_STARTER_WATCHLISTS[focus].map((sym) => (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => toggleTicker(sym)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-mono border ${
                          watchlist.includes(sym)
                            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                            : "border-zinc-700 text-zinc-400"
                        }`}
                      >
                        {watchlist.includes(sym) && <Check className="w-3 h-3 inline mr-1" />}
                        {sym}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="mt-2 text-xs text-emerald-400 hover:underline"
                    onClick={() => setWatchlist(FOCUS_STARTER_WATCHLISTS[focus])}
                  >
                    Use full starter list
                  </button>
                </div>
              )}
              <div>
                <label className="text-xs text-zinc-500">Add symbols (comma-separated)</label>
                <input
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="AAPL, TSLA, SOFI…"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                />
                <p className="text-xs text-zinc-600 mt-1">
                  Selected: {watchlist.length}
                  {customInput.trim()
                    ? ` + typed`
                    : ""}{" "}
                  (need 5+)
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 mb-4">
              {(Object.keys(ALERT_STYLE_PRESETS) as AlertStyle[]).map((id) => {
                const p = ALERT_STYLE_PRESETS[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAlertStyle(id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border ${
                      alertStyle === id
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-zinc-700 hover:border-zinc-500"
                    }`}
                  >
                    <div className="text-sm font-medium">{p.label}</div>
                    <div className="text-xs text-zinc-500">{p.description}</div>
                  </button>
                );
              })}
              <p className="text-xs text-zinc-500">
                We&apos;ll enable email alerts and send a one-time test to your account email.
                {testStatus === "sent" && " Test sent."}
                {testStatus === "failed" && " Test failed — retry later in Settings."}
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 mb-3" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-between gap-3">
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            ) : (
              <span />
            )}
            {step === 0 && (
              <Button type="button" onClick={() => void saveFocus()} disabled={!focus || saving}>
                Continue <ChevronRight className="w-4 h-4" />
              </Button>
            )}
            {step === 1 && (
              <Button type="button" onClick={() => void saveWatchlist()} disabled={saving}>
                Continue <ChevronRight className="w-4 h-4" />
              </Button>
            )}
            {step === 2 && (
              <Button type="button" onClick={() => void saveAlertsAndTest()} disabled={saving}>
                {saving ? "Sending…" : "Save & send test"}
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
