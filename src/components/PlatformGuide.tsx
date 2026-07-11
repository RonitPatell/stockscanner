"use client";

import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { CircleHelp, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  DASHBOARD_GUIDE_STEPS,
  DESK_GUIDE_STEPS,
  PLATFORM_GUIDE_VERSION,
  type GuideStep,
  type GuideSurface,
} from "@/lib/platform-guide";
import { cn } from "@/lib/utils";

const SEEN_KEY = "tt-platform-guide-seen-v";

function stepsFor(surface: GuideSurface): GuideStep[] {
  return surface === "desk" ? DESK_GUIDE_STEPS : DASHBOARD_GUIDE_STEPS;
}

export function PlatformGuide({
  surface = "dashboard",
  onExtrasRequired,
}: {
  surface?: GuideSurface;
  /** Called when a step needs judgment tools expanded */
  onExtrasRequired?: () => void;
}) {
  const steps = stepsFor(surface);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = steps[index] ?? steps[0];

  const measure = useCallback(() => {
    if (!open || !step?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-guide="${step.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setRect(el.getBoundingClientRect());
  }, [open, step?.target]);

  useLayoutEffect(() => {
    if (!open) return;
    if (step?.requiresExtras) onExtrasRequired?.();
    const t = window.setTimeout(measure, step?.requiresExtras ? 120 : 30);
    return () => clearTimeout(t);
  }, [open, index, step, measure, onExtrasRequired]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        setIndex((i) => Math.min(steps.length - 1, i + 1));
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, steps.length]);

  const start = () => {
    setIndex(0);
    setOpen(true);
  };

  const finish = () => {
    try {
      localStorage.setItem(`${SEEN_KEY}${PLATFORM_GUIDE_VERSION}`, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const next = () => {
    if (index >= steps.length - 1) finish();
    else setIndex((i) => i + 1);
  };

  const back = () => setIndex((i) => Math.max(0, i - 1));

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="fixed bottom-4 right-4 z-[60] inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-zinc-950/95 px-3.5 py-2.5 text-sm font-medium text-emerald-300 shadow-lg shadow-emerald-500/10 hover:bg-emerald-500/10 hover:border-emerald-400/60 transition-colors backdrop-blur-md"
        title="Platform guide"
      >
        <CircleHelp className="w-4 h-4" />
        <span className="hidden sm:inline">Guide</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Platform guide">
          {/* Dim + spotlight hole */}
          <div className="absolute inset-0 bg-black/70" onClick={finish} />
          {rect && (
            <div
              className="pointer-events-none absolute rounded-xl ring-2 ring-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.72)] transition-all duration-300"
              style={{
                top: Math.max(8, rect.top - 6),
                left: Math.max(8, rect.left - 6),
                width: Math.min(window.innerWidth - 16, rect.width + 12),
                height: Math.min(window.innerHeight - 16, rect.height + 12),
              }}
            />
          )}

          <div
            className={cn(
              "absolute z-[71] w-[min(100%-1.5rem,380px)] rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl",
              rect && rect.bottom < window.innerHeight * 0.55
                ? "translate-y-0"
                : ""
            )}
            style={cardPosition(rect)}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-500/90 font-semibold mb-1">
                  Guide · {index + 1}/{steps.length}
                </p>
                <h2 className="text-lg font-bold text-zinc-50 leading-tight">{step.title}</h2>
              </div>
              <button
                type="button"
                onClick={finish}
                className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                aria-label="Close guide"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-zinc-400 leading-relaxed mb-3">{step.body}</p>
            {step.tip && (
              <p className="text-[11px] text-emerald-400/80 mb-4 font-medium">{step.tip}</p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={back}
                disabled={index === 0}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </button>
              <div className="flex-1 flex justify-center gap-1">
                {steps.map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      i === index ? "bg-emerald-400" : "bg-zinc-700"
                    )}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-black font-semibold hover:bg-emerald-400"
              >
                {index >= steps.length - 1 ? "Done" : "Next"}
                {index < steps.length - 1 && <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function cardPosition(rect: DOMRect | null): CSSProperties {
  if (!rect) {
    return {
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  const pad = 16;
  const cardW = Math.min(380, window.innerWidth - 24);
  let left = rect.left;
  if (left + cardW > window.innerWidth - pad) {
    left = window.innerWidth - cardW - pad;
  }
  left = Math.max(pad, left);

  const spaceBelow = window.innerHeight - rect.bottom;
  const preferBelow = spaceBelow > 220;
  let top = preferBelow ? rect.bottom + 12 : rect.top - 12;
  if (!preferBelow) {
    return {
      left,
      top: Math.max(pad, top),
      transform: "translateY(-100%)",
    };
  }
  if (top + 240 > window.innerHeight - pad) {
    top = Math.max(pad, window.innerHeight - 260);
  }
  return { left, top };
}
