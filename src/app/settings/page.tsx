"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Zap, ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [discordWebhook, setDiscordWebhook] = useState("");
  const [discordAlertsEnabled, setDiscordAlertsEnabled] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session) {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((data) => {
          setDiscordWebhook(data.discordWebhook || "");
          setDiscordAlertsEnabled(data.discordAlertsEnabled || false);
          setLoading(false);
        });
    }
  }, [session]);

  const handleSave = async () => {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordWebhook, discordAlertsEnabled }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleManageBilling = async () => {
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Link href="/login"><Button>Sign In</Button></Link>
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
          <Zap className="w-4 h-4 text-emerald-400" />
          <span className="font-bold">Settings</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-8">
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Discord Alerts</h2>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={discordAlertsEnabled}
                onChange={(e) => setDiscordAlertsEnabled(e.target.checked)}
                className="rounded"
              />
              Enable Discord webhook alerts
            </label>
            <input
              type="url"
              placeholder="https://discord.com/api/webhooks/..."
              value={discordWebhook}
              onChange={(e) => setDiscordWebhook(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
            <p className="text-xs text-zinc-600">
              Discord → Server Settings → Integrations → Webhooks → New Webhook → Copy URL
            </p>

            <Button onClick={handleSave} disabled={loading} className="w-full">
              <Save className="w-4 h-4" />
              {saved ? "Saved!" : "Save Alert Settings"}
            </Button>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Billing</h2>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
            <p className="text-sm text-zinc-400 mb-4">Manage your $40/month subscription</p>
            <Button variant="secondary" onClick={handleManageBilling} className="w-full">
              Manage Billing
            </Button>
          </div>
        </section>

        <DisclaimerBanner compact />
      </main>
    </div>
  );
}
