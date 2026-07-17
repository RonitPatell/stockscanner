"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { ArrowLeft, Save, CreditCard, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { formatSubscriptionEnd } from "@/lib/subscription";
import { LogoMark } from "@/components/Logo";
import { AlertRulesPanel } from "@/components/AlertRulesPanel";
import { PushNotifyToggle } from "@/components/PushNotifyToggle";
import { AlertHistoryPanel } from "@/components/AlertHistoryPanel";
import type { AlertRule } from "@/lib/alert-rules";
import { DEFAULT_ALERT_RULES } from "@/lib/alert-rules";

interface SettingsData {
  discordWebhook?: string;
  discordAlertsEnabled?: boolean;
  smsAlertsEnabled?: boolean;
  emailAlertsEnabled?: boolean;
  emailBriefEnabled?: boolean;
  watchlist?: string[];
  subscriptionStatus?: string | null;
  subscriptionEndsAt?: string | null;
  alertRules?: AlertRule[];
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [discordWebhook, setDiscordWebhook] = useState("");
  const [discordAlertsEnabled, setDiscordAlertsEnabled] = useState(false);
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(false);
  const [smsAlertsEnabled, setSmsAlertsEnabled] = useState(false);
  const [emailBriefEnabled, setEmailBriefEnabled] = useState(true);
  const [watchlistInput, setWatchlistInput] = useState("");
  const [billing, setBilling] = useState<
    Pick<SettingsData, "subscriptionStatus" | "subscriptionEndsAt">
  >({});
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(false);
  const [alertRules, setAlertRules] = useState<AlertRule[]>(DEFAULT_ALERT_RULES);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (session) {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((data: SettingsData) => {
          setDiscordWebhook(data.discordWebhook || "");
          setDiscordAlertsEnabled(data.discordAlertsEnabled || false);
          setSmsAlertsEnabled(data.smsAlertsEnabled || false);
          setEmailAlertsEnabled(data.emailAlertsEnabled || false);
          setEmailBriefEnabled(data.emailBriefEnabled !== false);
          setWatchlistInput((data.watchlist ?? []).join(", "));
          setBilling({
            subscriptionStatus: data.subscriptionStatus,
            subscriptionEndsAt: data.subscriptionEndsAt,
          });
          if (Array.isArray(data.alertRules) && data.alertRules.length > 0) {
            setAlertRules(data.alertRules as AlertRule[]);
          }
          setLoading(false);
        });
    }
  }, [session]);

  const handleSave = async () => {
    const watchlist = watchlistInput
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z]{1,5}$/.test(s));

    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        discordWebhook,
        discordAlertsEnabled,
        smsAlertsEnabled,
        emailAlertsEnabled,
        emailBriefEnabled,
        watchlist,
        alertRules,
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleManageBilling = async () => {
    setBillingLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setDeleteError(data.error || "Could not open billing portal.");
    } finally {
      setBillingLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError("");
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(data.error || "Could not delete account.");
        return;
      }
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      await signOut({ callbackUrl: `${origin}/` });
    } catch {
      setDeleteError("Network error. Try again.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const accessUntil = formatSubscriptionEnd(billing.subscriptionEndsAt);
  const isSubscribed =
    billing.subscriptionStatus === "active" || billing.subscriptionStatus === "trialing";
  const blocksDelete =
    billing.subscriptionStatus === "active" ||
    billing.subscriptionStatus === "trialing" ||
    billing.subscriptionStatus === "past_due";

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Link href="/login">
          <Button>Sign In</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 px-4 sm:px-6 h-14 flex items-center gap-4">
        <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-100">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-2">
          <LogoMark className="w-7 h-7" />
          <span className="font-bold">Settings</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-8">
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Watchlist &amp; Alerts</h2>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-4">
            <div>
              <label className="text-sm font-medium text-zinc-300 block mb-1.5">
                Watchlist tickers
              </label>
              <input
                type="text"
                placeholder="NVDA, AMD, SOFI, PLTR"
                value={watchlistInput}
                onChange={(e) => setWatchlistInput(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
              <p className="text-xs text-zinc-600 mt-1.5">
                Comma-separated. You&apos;ll get alerts when these tickers hit the news feed.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={discordAlertsEnabled}
                onChange={(e) => setDiscordAlertsEnabled(e.target.checked)}
                className="rounded"
              />
              Discord alerts (watchlist + urgent catalysts)
            </label>

            <input
              type="url"
              placeholder="https://discord.com/api/webhooks/..."
              value={discordWebhook}
              onChange={(e) => setDiscordWebhook(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />

            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={emailAlertsEnabled}
                onChange={(e) => setEmailAlertsEnabled(e.target.checked)}
                className="rounded"
              />
              Email alerts (sent to your account email)
            </label>
            <p className="text-xs text-zinc-600">
              Requires RESEND_API_KEY on the server. Great when you&apos;re away from Discord.
            </p>

            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={emailBriefEnabled}
                onChange={(e) => setEmailBriefEnabled(e.target.checked)}
                className="rounded"
              />
              Daily email briefs (morning + EOD recap)
            </label>
            <p className="text-xs text-zinc-600">
              Watchlist summary delivered ~7:30 AM and ~4:15 PM ET. Also sends push if enabled.
            </p>

            <div>
              <p className="text-sm font-medium text-zinc-300 mb-2">Browser push notifications</p>
              <PushNotifyToggle />
            </div>

            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={smsAlertsEnabled}
                onChange={(e) => setSmsAlertsEnabled(e.target.checked)}
                className="rounded"
              />
              SMS alerts for watchlist news
            </label>
            <p className="text-xs text-zinc-600">
              SMS uses your account phone number. Requires Twilio env vars on the server.
            </p>

            <Button onClick={handleSave} disabled={loading} className="w-full">
              <Save className="w-4 h-4" />
              {saved ? "Saved!" : "Save Watchlist & Alerts"}
            </Button>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-300">Alert rules</h3>
            <p className="text-xs text-zinc-600">
              Trader-grade filters: % move, RVOL, float cap, cooldowns, and news-only triggers.
            </p>
            <AlertRulesPanel rules={alertRules} onChange={setAlertRules} />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-300">Recent alerts</h3>
            <AlertHistoryPanel />
          </div>

          <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
            <h3 className="text-sm font-semibold text-zinc-300">Chrome overlay</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Floating TrustTicker chip on TradingView charts. Load the unpacked extension from the
              repo folder <span className="font-mono text-zinc-400">extensions/trustticker-overlay</span>{" "}
              in <span className="font-mono text-zinc-400">chrome://extensions</span> (Developer mode
              → Load unpacked).
            </p>
            <ol className="text-xs text-zinc-500 list-decimal pl-4 space-y-1">
              <li>Open Chrome → Extensions → enable Developer mode</li>
              <li>Load unpacked → select <span className="font-mono">extensions/trustticker-overlay</span></li>
              <li>Open a TradingView chart — the TT chip appears for the ticker</li>
            </ol>
            <a
              href="https://www.trustticker.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-400 hover:underline"
            >
              Overlay points at trustticker.com in production
            </a>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Billing</h2>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-4">
            {isSubscribed ? (
              <>
                <div className="text-sm space-y-1">
                  <p className="text-zinc-300">
                    Status:{" "}
                    <span className="text-emerald-400 capitalize">{billing.subscriptionStatus}</span>
                  </p>
                  {accessUntil && (
                    <p className="text-zinc-500">
                      {billing.subscriptionStatus === "trialing"
                        ? `Trial ends ${accessUntil}`
                        : `Current period ends ${accessUntil}`}
                    </p>
                  )}
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  To cancel, open the billing portal below and choose{" "}
                  <span className="text-zinc-400">Cancel subscription</span>. You keep full scanner
                  access until the end of your current billing period — you won&apos;t be charged
                  again.
                </p>
                <Button
                  variant="secondary"
                  onClick={handleManageBilling}
                  disabled={billingLoading}
                  className="w-full"
                >
                  <CreditCard className="w-4 h-4" />
                  {billingLoading ? "Opening portal…" : "Manage subscription & cancel"}
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-zinc-400">
                  {billing.subscriptionStatus === "past_due"
                    ? "Billing is past due."
                    : billing.subscriptionStatus === "canceled"
                      ? "Subscription canceled."
                      : "No active subscription."}
                </p>
                {(billing.subscriptionStatus === "past_due" ||
                  billing.subscriptionStatus === "canceled") && (
                  <Button
                    variant="secondary"
                    onClick={handleManageBilling}
                    disabled={billingLoading}
                    className="w-full"
                  >
                    <CreditCard className="w-4 h-4" />
                    {billingLoading ? "Opening portal…" : "Open billing portal"}
                  </Button>
                )}
                <Link href="/pricing">
                  <Button className="w-full">View plans</Button>
                </Link>
              </>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-red-400/90">Danger zone</h2>
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 space-y-4">
            <div>
              <p className="text-sm text-zinc-300 font-medium">Delete account</p>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                Permanently removes your account, watchlist, alert settings, and related personal
                data. This cannot be undone.
              </p>
            </div>

            {blocksDelete ? (
              <div className="space-y-3">
                <p className="text-sm text-amber-200/90 leading-relaxed">
                  You still have an{" "}
                  <span className="font-semibold capitalize">{billing.subscriptionStatus}</span>{" "}
                  subscription. Cancel it in Manage billing first, then come back here to delete
                  your account.
                </p>
                <Button
                  variant="secondary"
                  onClick={handleManageBilling}
                  disabled={billingLoading}
                  className="w-full"
                >
                  <CreditCard className="w-4 h-4" />
                  {billingLoading ? "Opening portal…" : "Cancel subscription first"}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="text-xs text-zinc-500 block">
                  Type <span className="text-zinc-300 font-mono">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500/40"
                  autoComplete="off"
                />
                {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
                <Button
                  className="w-full bg-red-600 hover:bg-red-500 text-white"
                  disabled={deleteLoading || deleteConfirm.trim().toUpperCase() !== "DELETE"}
                  onClick={() => void handleDeleteAccount()}
                >
                  <Trash2 className="w-4 h-4" />
                  {deleteLoading ? "Deleting…" : "Delete my account"}
                </Button>
              </div>
            )}
          </div>
        </section>

        <p className="text-[11px] text-zinc-600 text-center">
          <Link href="/legal/privacy" className="hover:text-zinc-400">
            Privacy
          </Link>
          {" · "}
          <Link href="/legal/cookies" className="hover:text-zinc-400">
            Cookies
          </Link>
          {" · "}
          <Link href="/legal/terms" className="hover:text-zinc-400">
            Terms
          </Link>
        </p>

        <DisclaimerBanner compact />
      </main>
    </div>
  );
}
