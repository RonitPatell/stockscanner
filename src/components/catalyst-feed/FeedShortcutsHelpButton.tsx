"use client";

import { useEffect, useId, useState } from "react";
import { Keyboard, Settings2, X } from "lucide-react";
import {
  DEFAULT_FEED_V3_PREFS,
  FEED_V3_SHORTCUTS,
  loadFeedV3Prefs,
  saveFeedV3Prefs,
  type FeedV3DisplayPrefs,
} from "@/lib/catalyst-feed-v3";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";

export function FeedShortcutsHelpButton({
  className,
}: {
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefs, setPrefs] = useState<FeedV3DisplayPrefs>(DEFAULT_FEED_V3_PREFS);
  const titleId = useId();

  useEffect(() => {
    setPrefs(loadFeedV3Prefs());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        if (
          t &&
          (t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        setPrefsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const updatePref = (key: keyof FeedV3DisplayPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    saveFeedV3Prefs(next);
    window.dispatchEvent(new Event("tt-feed-v3-prefs"));
  };

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <button
        type="button"
        data-testid="feed-shortcuts-help"
        title="Keyboard shortcuts"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded border border-zinc-700 px-1.5 py-1 text-[10px] text-zinc-400 hover:text-zinc-200"
      >
        <Keyboard className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Shortcuts</span>
      </button>
      <button
        type="button"
        data-testid="feed-display-prefs"
        title="Display preferences"
        onClick={() => setPrefsOpen(true)}
        className="inline-flex items-center gap-1 rounded border border-zinc-700 px-1.5 py-1 text-[10px] text-zinc-400 hover:text-zinc-200"
      >
        <Settings2 className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Columns</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-950 p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h2 id={titleId} className="text-sm font-semibold text-zinc-100">
                Keyboard shortcuts
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-100"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="space-y-1.5 text-[12px]">
              {FEED_V3_SHORTCUTS.map((s) => (
                <li key={s.keys} className="flex justify-between gap-4">
                  <kbd className="font-mono text-cyan-300 shrink-0">{s.keys}</kbd>
                  <span className="text-zinc-300 text-right">{s.action}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {prefsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Display preferences"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close"
            onClick={() => setPrefsOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-950 p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-100">
                Advanced columns
              </h2>
              <button
                type="button"
                onClick={() => setPrefsOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-100"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-zinc-500">
              Collapsed rows stay minimal by default. Enable extras only if you
              need them.
            </p>
            {(
              [
                ["showGradeColumn", "Legacy desk grade (compat only)"],
                ["showFloat", "Float"],
                ["showMarketCap", "Market cap"],
                ["showSentimentScore", "Sentiment score"],
                ["showGapperLabel", "Gapper label"],
                ["showAllRisks", "All risk flags"],
                ["showInternalSourceName", "Internal source name"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 text-[12px] text-zinc-300"
              >
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={(e) => updatePref(key, e.target.checked)}
                />
                {label}
              </label>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setPrefs(DEFAULT_FEED_V3_PREFS);
                saveFeedV3Prefs(DEFAULT_FEED_V3_PREFS);
                window.dispatchEvent(new Event("tt-feed-v3-prefs"));
              }}
            >
              Reset defaults
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
