"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { usePathname } from "next/navigation";
import { CircleHelp, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  DASHBOARD_GUIDE_STEPS,
  DESK_GUIDE_STEPS,
  PLATFORM_GUIDE_VERSION,
  type GuideSurface,
} from "@/lib/platform-guide";
import { cn } from "@/lib/utils";

const SEEN_KEY = "tt-platform-guide-seen-v";
const CARD_W = 360;
const CARD_EST_H = 220;
const PAD = 12;

function stepsFor(surface: GuideSurface) {
  return surface === "desk" ? DESK_GUIDE_STEPS : DASHBOARD_GUIDE_STEPS;
}

/** Visible intersection of element with the viewport (for tall panels). */
function visibleRect(el: Element): DOMRect {
  const r = el.getBoundingClientRect();
  const top = Math.max(PAD, Math.min(r.top, window.innerHeight - PAD));
  const left = Math.max(PAD, Math.min(r.left, window.innerWidth - PAD));
  const bottom = Math.max(top + 40, Math.min(r.bottom, window.innerHeight - PAD));
  const right = Math.max(left + 40, Math.min(r.right, window.innerWidth - PAD));
  return new DOMRect(left, top, right - left, bottom - top);
}

function clampCard(left: number, top: number, cardH: number): { left: number; top: number } {
  const maxLeft = window.innerWidth - CARD_W - PAD;
  const maxTop = window.innerHeight - cardH - PAD;
  return {
    left: Math.max(PAD, Math.min(left, maxLeft)),
    top: Math.max(PAD, Math.min(top, Math.max(PAD, maxTop))),
  };
}

export function PlatformGuide({
  surface = "dashboard",
  onExtrasRequired,
}: {
  surface?: GuideSurface;
  /** Called when a step needs another destination/panel visible first */
  onExtrasRequired?: (step: { id: string; target?: string }) => void;
}) {
  const steps = stepsFor(surface);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [hole, setHole] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardPos, setCardPos] = useState<CSSProperties>({
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
  });

  const step = steps[index] ?? steps[0];

  const clearHighlight = useCallback(() => {
    document.querySelectorAll("[data-guide-active='true']").forEach((node) => {
      node.removeAttribute("data-guide-active");
      (node as HTMLElement).style.zIndex = "";
      (node as HTMLElement).style.position = "";
      (node as HTMLElement).style.boxShadow = "";
      (node as HTMLElement).style.outline = "";
      (node as HTMLElement).style.outlineOffset = "";
      (node as HTMLElement).style.borderRadius = "";
      (node as HTMLElement).style.transition = "";
    });
  }, []);

  const applyHighlight = useCallback((el: HTMLElement) => {
    clearHighlight();
    const computed = window.getComputedStyle(el);
    if (computed.position === "static") {
      el.style.position = "relative";
    }
    el.style.zIndex = "75";
    el.style.outline = "2px solid rgba(52, 211, 153, 0.95)";
    el.style.outlineOffset = "3px";
    el.style.borderRadius = "12px";
    el.style.boxShadow =
      "0 0 0 6px rgba(16, 185, 129, 0.2), 0 12px 40px rgba(0,0,0,0.45)";
    el.style.transition = "outline 0.2s ease, box-shadow 0.2s ease";
    el.setAttribute("data-guide-active", "true");
  }, [clearHighlight]);

  const placeCard = useCallback((target: DOMRect | null) => {
    const cardH = cardRef.current?.offsetHeight || CARD_EST_H;
    if (!target) {
      setCardPos({
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      });
      return;
    }

    const spaceBelow = window.innerHeight - target.bottom;
    const spaceAbove = target.top;
    const spaceRight = window.innerWidth - target.right;

    let left = target.left;
    let top: number;
    let transform: string | undefined;

    // Prefer dock under / over the hole; if panel is huge, dock to safe corner
    if (target.height > window.innerHeight * 0.55) {
      // Tall panel (news feed) — pin card to bottom-left of viewport, clear of hole if possible
      if (spaceRight > CARD_W + 24) {
        left = target.right + 12;
        top = Math.min(target.top + 24, window.innerHeight - cardH - PAD);
      } else {
        left = PAD;
        top = window.innerHeight - cardH - PAD;
      }
    } else if (spaceBelow >= cardH + 20) {
      top = target.bottom + 14;
      left = target.left;
    } else if (spaceAbove >= cardH + 20) {
      top = target.top - 14;
      transform = "translateY(-100%)";
      left = target.left;
    } else if (spaceRight >= CARD_W + 20) {
      left = target.right + 14;
      top = target.top;
    } else {
      left = PAD;
      top = window.innerHeight - cardH - PAD;
    }

    if (transform === "translateY(-100%)") {
      const clamped = clampCard(left, top - cardH, cardH);
      // convert back: we want top as the bottom edge of card before translate
      setCardPos({
        left: clamped.left,
        top: clamped.top + cardH,
        transform: "translateY(-100%)",
      });
      return;
    }

    const clamped = clampCard(left, top, cardH);
    setCardPos({ left: clamped.left, top: clamped.top, transform: undefined });
  }, []);

  const measure = useCallback(() => {
    if (!open) {
      setHole(null);
      return;
    }
    if (!step?.target) {
      clearHighlight();
      setHole(null);
      placeCard(null);
      return;
    }
    const el = document.querySelector(`[data-guide="${step.target}"]`) as HTMLElement | null;
    if (!el) {
      clearHighlight();
      setHole(null);
      placeCard(null);
      return;
    }

    applyHighlight(el);
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });

    // Remeasure after scroll settles so hole matches visible panel
    window.setTimeout(() => {
      const next = visibleRect(el);
      setHole(next);
      placeCard(next);
    }, 280);
  }, [open, step?.target, applyHighlight, clearHighlight, placeCard]);

  useLayoutEffect(() => {
    if (!open) {
      clearHighlight();
      return;
    }
    if (step?.requiresExtras) {
      onExtrasRequired?.({ id: step.id, target: step.target });
    }
    const delay = step?.requiresExtras ? 220 : 40;
    const t = window.setTimeout(measure, delay);
    return () => clearTimeout(t);
  }, [open, index, step, measure, onExtrasRequired, clearHighlight]);

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
      if (e.key === "Escape") {
        clearHighlight();
        setOpen(false);
      }
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
  }, [open, steps.length, clearHighlight]);

  useEffect(() => () => clearHighlight(), [clearHighlight]);

  // Never trap navigation when the user leaves the desk
  useEffect(() => {
    clearHighlight();
    setOpen(false);
  }, [pathname, clearHighlight]);

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
    clearHighlight();
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
          {/* Four-pane dim so the panel hole stays fully visible */}
          {hole ? (
            <>
              <div
                className="absolute bg-black/75 pointer-events-auto"
                style={{ left: 0, top: 0, right: 0, height: Math.max(0, hole.top) }}
                onClick={finish}
              />
              <div
                className="absolute bg-black/75 pointer-events-auto"
                style={{
                  left: 0,
                  top: hole.top,
                  width: Math.max(0, hole.left),
                  height: hole.height,
                }}
                onClick={finish}
              />
              <div
                className="absolute bg-black/75 pointer-events-auto"
                style={{
                  left: hole.right,
                  top: hole.top,
                  right: 0,
                  height: hole.height,
                }}
                onClick={finish}
              />
              <div
                className="absolute bg-black/75 pointer-events-auto"
                style={{
                  left: 0,
                  top: hole.bottom,
                  right: 0,
                  bottom: 0,
                }}
                onClick={finish}
              />
              {/* Trace ring around the hole (doesn't cover content) */}
              <div
                className="pointer-events-none absolute rounded-xl ring-2 ring-emerald-400 animate-pulse"
                style={{
                  top: hole.top - 4,
                  left: hole.left - 4,
                  width: hole.width + 8,
                  height: hole.height + 8,
                }}
              />
            </>
          ) : (
            <div className="absolute inset-0 bg-black/70" onClick={finish} />
          )}

          <div
            ref={cardRef}
            className="absolute z-[80] w-[min(100%-1.5rem,360px)] max-h-[min(70vh,420px)] overflow-y-auto rounded-2xl border border-emerald-500/30 bg-zinc-950 p-5 shadow-2xl"
            style={cardPos}
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
                className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 shrink-0"
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
              <div className="flex-1 flex justify-center gap-1 flex-wrap">
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
