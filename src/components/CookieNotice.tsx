"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "trustticker:cookie-consent:v1";

/**
 * Lightweight notice for essential + analytics cookies.
 * Essential auth cookies are always on; this records acknowledgment.
 */
export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ acceptedAt: new Date().toISOString() }));
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[60] p-3 sm:p-4 pointer-events-none">
      <div className="pointer-events-auto max-w-3xl mx-auto rounded-xl border border-zinc-700 bg-zinc-950/95 backdrop-blur-xl shadow-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed flex-1">
          We use essential cookies to keep you signed in and privacy-oriented analytics (Vercel) to
          improve the product. See our{" "}
          <Link href="/legal/cookies" className="text-emerald-400 hover:underline">
            Cookie Policy
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="text-emerald-400 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={accept}
          className="shrink-0 rounded-lg bg-emerald-500 text-black text-sm font-semibold px-4 py-2 hover:bg-emerald-400 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
