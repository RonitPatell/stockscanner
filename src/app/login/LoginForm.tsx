"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { LogoMark } from "@/components/Logo";
import { entitledDashboardHref } from "@/lib/monitor/route";
import {
  prefetchMonitorRoute,
  warmMonitorCriticalAssets,
} from "@/lib/monitor/prefetch";
import { isSubscribedFromSettings } from "@/lib/subscription-client";

/** Only allow same-origin relative paths (blocks open redirects). */
function safeReturnPath(raw: string | null): string | null {
  if (!raw) return null;
  if (raw === "checkout") return "/subscribe";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return null;
  return raw;
}

function defaultPostAuthPath(): string {
  return entitledDashboardHref();
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRegister = searchParams.get("register") === "true";
  const nextParam = searchParams.get("next") ?? searchParams.get("callbackUrl");
  const returnTo = safeReturnPath(nextParam) ?? defaultPostAuthPath();

  const [mode, setMode] = useState<"login" | "register">(isRegister ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "register") {
        void fetch("/api/analytics/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "signup_started" }),
        }).catch(() => {});

        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            ...(name.trim() ? { name: name.trim() } : {}),
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Registration failed");
          setLoading(false);
          return;
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password");
        setLoading(false);
        return;
      }

      // Entitlement-gated Monitor prefetch — never for non-Pro; no snapshot poll.
      let target = returnTo;
      try {
        const settings = await fetch("/api/settings").then((r) =>
          r.ok ? r.json() : null
        );
        const subscribed = isSubscribedFromSettings(settings);
        if (subscribed) {
          const access = { subscribed: true as const };
          await prefetchMonitorRoute(router, access);
          void warmMonitorCriticalAssets(access);
          if (
            returnTo === "/dashboard" ||
            returnTo.startsWith("/dashboard?")
          ) {
            target = entitledDashboardHref();
          }
        }
      } catch {
        /* navigate anyway */
      }

      router.push(target);
      router.refresh();
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="marketing-shell min-h-screen flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-50 pointer-events-none" />
      <div className="mk-glow-top absolute inset-x-0 top-0 h-[50vh] pointer-events-none" />

      <header className="relative border-b mk-hairline px-4 sm:px-6 h-16 flex items-center justify-between z-10">
        <Link
          href="/"
          className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <div className="flex items-center gap-2">
            <LogoMark className="w-7 h-7" />
            <span className="font-semibold tracking-tight">
              Trust<span className="text-emerald-400">Ticker</span>
            </span>
          </div>
        </Link>
        <span className="mk-tick hidden sm:inline">Secure sign-in</span>
      </header>

      <main className="relative flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md price-rise">
          <div className="mk-panel mk-corners p-7 sm:p-9">
            <div className="text-center mb-8">
              <LogoMark className="w-11 h-11 mx-auto mb-5" />
              <h1 className="mk-display text-2xl sm:text-[1.75rem] mb-2">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </h1>
              <p className="mk-tick normal-case !tracking-[0.06em]">
                {mode === "register"
                  ? "7-day free trial · cancel anytime"
                  : "Sign in to your TrustTicker desk"}
              </p>
            </div>

            {/* Mode toggle */}
            <div
              className="grid grid-cols-2 gap-1 p-1 border border-[var(--border-medium)] bg-black/30 mb-6"
              role="tablist"
              aria-label="Sign in or create account"
            >
              {(
                [
                  { key: "login", label: "Sign in" },
                  { key: "register", label: "Create account" },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={mode === t.key}
                  onClick={() => {
                    setMode(t.key);
                    setError("");
                  }}
                  className={
                    mode === t.key
                      ? "py-2 bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-semibold transition-colors"
                      : "py-2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] text-sm font-medium transition-colors"
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div>
                  <label htmlFor="auth-name" className="mk-tick block mb-1.5">
                    Name <span className="text-[var(--text-tertiary)]">(optional)</span>
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    placeholder="Your name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mk-input"
                  />
                </div>
              )}
              <div>
                <label htmlFor="auth-email" className="mk-tick block mb-1.5">
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mk-input"
                />
              </div>
              <div>
                <label htmlFor="auth-password" className="mk-tick block mb-1.5">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  placeholder={mode === "register" ? "8+ characters" : "Your password"}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mk-input"
                />
              </div>

              {error && (
                <p
                  className="text-red-400 text-sm border border-red-500/25 bg-red-500/10 px-3 py-2"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" className="w-full cta-glow" disabled={loading}>
                {loading
                  ? "One moment…"
                  : mode === "login"
                    ? "Sign in"
                    : "Create account"}
              </Button>
            </form>

            {mode === "register" && (
              <p className="mk-tick text-center normal-case !tracking-[0.06em] mt-4">
                Billing starts only if you stay past the trial
              </p>
            )}
          </div>

          <div className="mt-8">
            <DisclaimerBanner compact />
          </div>
        </div>
      </main>
    </div>
  );
}
