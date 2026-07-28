"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { ChevronDown, LogOut, Settings, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

import { isSubscribedFromSettings } from "@/lib/subscription-client";

export function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    void fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) {
          setIsSubscribed(isSubscribedFromSettings(data));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session?.user]);

  if (!session?.user) return null;

  const label = session.user.name || session.user.email?.split("@")[0] || "Account";
  const homeHref = isSubscribed ? "/dashboard" : "/demo";
  const homeLabel = isSubscribed ? "Live Scanner" : "Demo";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm",
          "border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/80",
          "transition-all duration-200 active:scale-[0.97]"
        )}
      >
        <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
          {label.charAt(0).toUpperCase()}
        </span>
        <span className="text-zinc-200 font-medium max-w-[100px] truncate hidden sm:inline">
          {label}
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-zinc-500 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-48 rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-2 border-b border-zinc-800">
            <p className="text-xs text-zinc-500 truncate">{session.user.email}</p>
          </div>
          <Link
            href={homeHref}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 transition-colors"
          >
            <LayoutDashboard className="w-4 h-4" /> {homeLabel}
          </Link>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 transition-colors"
          >
            <Settings className="w-4 h-4" /> Settings
          </Link>
          {isSubscribed && (
            <Link
              href="/gallery"
              data-guide="visual-system-gallery-link"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 transition-colors"
            >
              <span className="w-4 h-4 text-center text-[10px] font-bold tt-tone-brand">
                VS
              </span>{" "}
              Visual gallery
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              const origin =
                typeof window !== "undefined" ? window.location.origin : "";
              void signOut({ callbackUrl: `${origin}/` });
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-zinc-900 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
