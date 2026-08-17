"use client";

import { useState } from "react";
import { Plus, Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ResearchPersonalizedGate } from "./ResearchPersonalizedGate";

/**
 * Add / already-monitored control for Research workspace.
 * POSTs /api/portfolio — session ownership only.
 */
export function AddToPortfolioButton({
  symbol,
  entitled,
  initiallyInPortfolio = false,
  onAdded,
}: {
  symbol: string;
  entitled: boolean;
  initiallyInPortfolio?: boolean;
  onAdded?: () => void;
}) {
  const sym = symbol.toUpperCase();
  const [inPortfolio, setInPortfolio] = useState(initiallyInPortfolio);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<"login" | "subscribe" | null>(
    null
  );

  if (inPortfolio) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[12px] text-emerald-300/90 border border-emerald-500/30 rounded-md px-2.5 py-1.5"
        data-testid="research-in-portfolio"
      >
        <Check className="w-3.5 h-3.5" />
        Monitoring
      </span>
    );
  }

  if (gate) {
    return (
      <ResearchPersonalizedGate
        mode={gate}
        nextPath={`/dashboard?view=research&symbol=${encodeURIComponent(sym)}`}
      />
    );
  }

  async function handleAdd() {
    setError(null);
    if (!entitled) {
      setGate("subscribe");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ symbol: sym }),
      });
      if (res.status === 401) {
        setGate("login");
        return;
      }
      if (res.status === 403) {
        setGate("subscribe");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not add to portfolio"
        );
        return;
      }
      setInPortfolio(true);
      onAdded?.();
    } catch {
      setError("Could not add to portfolio");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleAdd()}
        className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
        data-testid="research-add-to-portfolio"
      >
        <Plus className="w-3.5 h-3.5" />
        {busy ? "Adding…" : "Add to Portfolio"}
      </button>
      {error ? (
        <p className="text-[11px] text-amber-300" data-testid="research-add-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
