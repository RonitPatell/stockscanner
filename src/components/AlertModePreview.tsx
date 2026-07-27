"use client";

import { useState } from "react";
import { Button } from "./ui/button";

interface ModePreview {
  mode: string;
  wouldFire: boolean;
  triggered: { id: string; label: string; detail?: string }[];
  blocked: { id: string; label: string; detail?: string }[];
}

export function AlertModePreview({ catalystId }: { catalystId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modes, setModes] = useState<ModePreview[] | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/alerts/preview?catalystId=${encodeURIComponent(catalystId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Preview unavailable");
        setModes(null);
        return;
      }
      setModes(data.modes ?? []);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-xs h-7"
        disabled={loading}
        onClick={() => void (open ? setOpen(false) : load())}
      >
        {loading ? "Loading…" : open ? "Hide alert preview" : "Alert preview"}
      </Button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      {open && modes && (
        <div className="mt-2 space-y-2 rounded-lg border border-zinc-800 bg-black/40 p-2">
          <p className="text-[10px] text-zinc-500">
            What would fire under each mode (dry-run — no send). Conditions that blocked are listed.
          </p>
          {modes.map((m) => (
            <div key={m.mode} className="text-xs border-b border-zinc-900 pb-2 last:border-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-zinc-200">{m.mode}</span>
                <span
                  className={
                    m.wouldFire ? "text-emerald-400" : "text-zinc-500"
                  }
                >
                  {m.wouldFire ? "Would fire" : "Blocked"}
                </span>
              </div>
              {m.triggered.length > 0 && (
                <ul className="mt-1 text-zinc-400 space-y-0.5">
                  {m.triggered.map((t) => (
                    <li key={t.id}>✓ {t.label}{t.detail ? ` (${t.detail})` : ""}</li>
                  ))}
                </ul>
              )}
              {m.blocked.length > 0 && (
                <ul className="mt-1 text-amber-500/90 space-y-0.5">
                  {m.blocked.map((t) => (
                    <li key={t.id}>✗ {t.label}{t.detail ? ` (${t.detail})` : ""}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
