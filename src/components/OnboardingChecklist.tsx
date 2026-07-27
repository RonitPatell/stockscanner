"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Circle, ListChecks, X } from "lucide-react";

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

interface ActivationPayload {
  activated?: boolean;
  missing?: string[];
  watchlistCount?: number;
  hasAlertChannel?: boolean;
  catalystsExpanded?: number;
  testAlertSent?: boolean;
}

export function OnboardingChecklist({
  forceShow,
  onResume,
}: {
  forceShow?: boolean;
  onResume?: () => void;
}) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [activation, setActivation] = useState<ActivationPayload | null>(null);
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(() => {
    void fetch("/api/onboarding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setItems(Array.isArray(d.checklist) ? d.checklist : []);
        setActivation(d.activation ?? null);
        const should =
          forceShow ||
          (d.showChecklist && !d.activation?.activated);
        setShow(Boolean(should));
      })
      .catch(() => {});
  }, [forceShow]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (dismissed || !show || activation?.activated) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[70] w-[min(100%-2rem,20rem)] rounded-xl border border-zinc-700 bg-zinc-950/95 shadow-xl p-3"
      data-guide="onboarding-checklist"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-zinc-200">
          <ListChecks className="w-4 h-4 text-emerald-400" />
          Setup checklist
        </div>
        <button
          type="button"
          className="text-zinc-500 hover:text-zinc-300"
          aria-label="Dismiss checklist"
          onClick={() => setDismissed(true)}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <ul className="space-y-1.5 mb-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-xs text-zinc-300">
            {item.done ? (
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <Circle className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
            )}
            {item.label}
          </li>
        ))}
      </ul>
      {activation?.missing && activation.missing.length > 0 && (
        <div className="text-[11px] text-zinc-500 mb-2 space-y-0.5">
          <p className="text-zinc-400">Activation:</p>
          {activation.missing.map((m) => (
            <p key={m}>• {m}</p>
          ))}
        </div>
      )}
      {onResume && (
        <button
          type="button"
          onClick={onResume}
          className="text-xs text-emerald-400 hover:underline"
        >
          Resume setup
        </button>
      )}
    </div>
  );
}
