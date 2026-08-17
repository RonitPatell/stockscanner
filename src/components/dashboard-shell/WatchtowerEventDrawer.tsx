"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Check, ExternalLink, X } from "lucide-react";
import type { WatchtowerEventDto } from "@/lib/watchtower/types";
import {
  formatEventWhen,
  reasonCodeLabel,
  significanceBadgeClass,
  significanceDisplay,
} from "@/lib/watchtower/ui";
import { openSafeHttpUrl, safeHttpUrl } from "@/lib/monitor/safe-open";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";

type DrawerMode = "side" | "overlay" | "sheet";

/**
 * Watchtower event detail — desk drawer (side / overlay / sheet).
 * Informational review context only.
 */
export function WatchtowerEventDrawer({
  event,
  open,
  onClose,
  onMarkRead,
  markingRead,
  mode,
}: {
  event: WatchtowerEventDto | null;
  open: boolean;
  onClose: () => void;
  onMarkRead: () => void;
  markingRead?: boolean;
  mode: DrawerMode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || mode === "side") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, mode]);

  if (!open || !event) {
    return (
      <aside
        data-guide="watchtower-event-drawer"
        data-drawer-state="closed"
        data-testid="watchtower-drawer-closed"
        className="hidden"
        aria-hidden
      />
    );
  }

  const source = safeHttpUrl(event.source.url);
  const level = event.significance.level;
  const reasons = event.significance.reasonCodes;

  const panel = (
    <div
      className={cn(
        "flex flex-col bg-[var(--bg-graphite)] border-[var(--border)] min-h-0",
        mode === "sheet"
          ? "rounded-t-xl border-t max-h-[85vh]"
          : "h-full border-l"
      )}
      role="dialog"
      aria-modal={mode !== "side"}
      aria-label={`Watchtower detail ${event.symbol}`}
      data-testid="watchtower-drawer-panel"
    >
      <div className="flex items-start justify-between gap-2 px-3 py-2.5 border-b border-[var(--border)] shrink-0">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">
            Event detail
          </p>
          <p className="text-sm font-semibold text-zinc-100 truncate font-mono">
            {event.symbol}
            {event.companyName ? (
              <span className="ml-2 font-sans font-normal text-zinc-400">
                {event.companyName}
              </span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          aria-label="Close event detail"
          data-testid="watchtower-drawer-close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
            Event
          </p>
          <p className="text-zinc-100 font-medium leading-snug">{event.title}</p>
          <p className="mt-1 text-[12px] text-zinc-500">
            {event.eventType.replace(/_/g, " ")} · {event.category}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium",
              significanceBadgeClass(level)
            )}
          >
            {significanceDisplay(level)}
          </span>
          <span className="text-[12px] text-zinc-500">
            {formatEventWhen(event.occurredAt)}
          </span>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
            What changed
          </p>
          <p className="text-zinc-300 leading-relaxed">
            {event.summary?.trim() ||
              "No additional factual summary on this row."}
          </p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
            Why it may deserve review
          </p>
          {reasons.length > 0 ? (
            <ul className="space-y-1.5">
              {reasons.map((code) => (
                <li
                  key={code}
                  className="text-zinc-300 text-[13px] leading-snug flex gap-2"
                >
                  <span className="text-zinc-600 shrink-0" aria-hidden>
                    ·
                  </span>
                  <span>{reasonCodeLabel(code)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-zinc-500 text-[13px]">
              No significance reasons recorded for this event.
            </p>
          )}
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
            Source
          </p>
          <p className="text-[12px] text-zinc-500 mb-2">
            {event.source.type}
            {event.source.id ? ` · ${event.source.id}` : ""}
          </p>
          {source ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              data-testid="watchtower-view-source"
              onClick={() => openSafeHttpUrl(source)}
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden />
              View source
            </Button>
          ) : (
            <p className="text-[12px] text-zinc-600">No source URL available.</p>
          )}
        </div>

        <p className="text-[11px] text-zinc-600 leading-relaxed border-t border-[var(--border)] pt-3">
          Informational only — not a buy or sell recommendation.
        </p>
      </div>

      <div className="shrink-0 border-t border-[var(--border)] px-3 py-2.5 flex flex-wrap gap-2">
        {!event.readState.isRead ? (
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={markingRead}
            data-testid="watchtower-mark-read"
            onClick={onMarkRead}
          >
            <Check className="w-3.5 h-3.5" aria-hidden />
            Mark as read
          </Button>
        ) : (
          <span className="text-[12px] text-zinc-500 self-center">
            Marked read
          </span>
        )}
        <Link
          href={`/ticker/${encodeURIComponent(event.symbol)}`}
          data-testid="watchtower-open-ticker"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          Open ticker
        </Link>
      </div>
    </div>
  );

  if (mode === "side") {
    return (
      <aside
        data-guide="watchtower-event-drawer"
        data-drawer-mode="side"
        data-drawer-state="open"
        data-event-id={event.id}
        className="hidden lg:flex w-[min(420px,40vw)] shrink-0 flex-col min-h-0"
      >
        {panel}
      </aside>
    );
  }

  if (mode === "overlay") {
    return (
      <div
        data-guide="watchtower-event-drawer"
        data-drawer-mode="overlay"
        data-drawer-state="open"
        data-event-id={event.id}
        className="fixed inset-0 z-40 flex justify-end"
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/50"
          aria-label="Dismiss event detail"
          onClick={onClose}
        />
        <aside className="relative z-10 w-[min(420px,92vw)] h-full shadow-2xl">
          {panel}
        </aside>
      </div>
    );
  }

  return (
    <div
      data-guide="watchtower-event-drawer"
      data-drawer-mode="sheet"
      data-drawer-state="open"
      data-event-id={event.id}
      className="fixed inset-0 z-40 flex flex-col justify-end"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Dismiss event detail"
        onClick={onClose}
      />
      <aside className="relative z-10 w-full shadow-2xl">{panel}</aside>
    </div>
  );
}
