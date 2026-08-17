"use client";

import { useEffect, useRef } from "react";
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
import { useFocusTrap } from "@/hooks/useFocusTrap";

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
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const modal = Boolean(open && event && mode !== "side");

  useFocusTrap(modal, panelRef, {
    onEscape: onClose,
    initialFocusRef: closeRef,
  });

  useEffect(() => {
    if (!open || mode !== "side") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, mode]);

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
      ref={panelRef}
      tabIndex={-1}
      className={cn(
        "flex flex-col bg-[var(--bg-graphite)] border-[var(--border)] min-h-0 outline-none",
        mode === "sheet"
          ? "rounded-t-xl border-t max-h-[min(85vh,100dvh)] pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0"
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
          <p className="text-sm font-semibold text-zinc-100 font-mono truncate">
            {event.symbol}
          </p>
          {event.companyName ? (
            <p className="text-[12px] font-sans font-normal text-zinc-400 truncate">
              {event.companyName}
            </p>
          ) : null}
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="rounded-md h-[44px] w-[44px] inline-flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          aria-label="Close event detail"
          data-testid="watchtower-drawer-close"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
            Event
          </p>
          <p className="text-zinc-100 font-medium leading-snug break-words">
            {event.title}
          </p>
          {event.thesisRelevance && event.thesisRelevance.status !== "none" ? (
            <p
              className="mt-2 text-[12px] text-emerald-400/90 leading-relaxed"
              data-testid="watchtower-drawer-thesis-relevance"
            >
              {event.thesisRelevance.status === "matches_condition"
                ? "Relevant to 1 thesis condition"
                : "Related to a thesis condition"}
              {event.thesisRelevance.conditionLabel
                ? ` — ${event.thesisRelevance.conditionLabel}`
                : ""}
              {event.thesisRelevance.summary
                ? `. ${event.thesisRelevance.summary}`
                : ""}
            </p>
          ) : (
            <p className="mt-2 text-[12px] text-zinc-500">
              Not tied to your thesis conditions.
            </p>
          )}
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
        className="fixed inset-0 z-50 flex justify-end"
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
      className="fixed inset-0 z-50 flex flex-col justify-end"
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
