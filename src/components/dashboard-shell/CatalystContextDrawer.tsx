"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { CatalystItem } from "@/types";
import { DecisionDrawerContent } from "../decision-drawer/DecisionDrawerContent";
import { cn } from "@/lib/utils";

type DrawerMode = "side" | "overlay" | "sheet";

/**
 * Selected-catalyst Decision Drawer:
 * - Desktop: right side column
 * - Tablet: overlay
 * - Mobile: bottom sheet (background scroll locked)
 *
 * Stays open while j/k changes the selected catalyst.
 * Escape closes. Deep-link via ?cid= is owned by the shell.
 */
export function CatalystContextDrawer({
  catalyst,
  open,
  onClose,
  mode,
  className,
}: {
  catalyst: CatalystItem | null;
  open: boolean;
  onClose: () => void;
  mode: DrawerMode;
  className?: string;
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

  // Prevent background scroll on overlay / sheet (tablet + mobile)
  useEffect(() => {
    if (!open || mode === "side") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, mode]);

  if (!open || !catalyst) {
    return (
      <aside
        data-guide="catalyst-context-drawer"
        data-drawer-state="closed"
        data-testid="catalyst-context-drawer-closed"
        className={cn("hidden", className)}
        aria-hidden
      />
    );
  }

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
      aria-label={`Decision drawer ${catalyst.symbol}`}
      data-testid="decision-drawer-panel"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border)] shrink-0">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-[--text-muted]">
            Decision drawer
          </p>
          <p className="text-sm font-semibold text-[--text-primary] truncate">
            {catalyst.symbol}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
          aria-label="Close decision drawer"
          data-testid="drawer-close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <DecisionDrawerContent
          key={catalyst.id}
          catalyst={catalyst}
          className="h-full"
        />
      </div>
    </div>
  );

  if (mode === "side") {
    return (
      <aside
        data-guide="catalyst-context-drawer"
        data-drawer-mode="side"
        data-drawer-state="open"
        data-catalyst-id={catalyst.id}
        className={cn(
          "hidden lg:flex w-[min(440px,40vw)] shrink-0 flex-col min-h-0",
          className
        )}
      >
        {panel}
      </aside>
    );
  }

  if (mode === "overlay") {
    return (
      <div
        data-guide="catalyst-context-drawer"
        data-drawer-mode="overlay"
        data-drawer-state="open"
        data-catalyst-id={catalyst.id}
        className="fixed inset-0 z-40 flex justify-end"
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/50"
          aria-label="Dismiss decision drawer"
          onClick={onClose}
        />
        <aside className="relative z-10 w-[min(440px,92vw)] h-full shadow-2xl">
          {panel}
        </aside>
      </div>
    );
  }

  return (
    <div
      data-guide="catalyst-context-drawer"
      data-drawer-mode="sheet"
      data-drawer-state="open"
      data-catalyst-id={catalyst.id}
      className="fixed inset-0 z-40 flex flex-col justify-end"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Dismiss decision drawer"
        onClick={onClose}
      />
      <aside className="relative z-10 w-full shadow-2xl">{panel}</aside>
    </div>
  );
}
