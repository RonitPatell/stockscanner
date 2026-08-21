"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./use-scroll-progress";

const SECTIONS = [
  { id: "hero", label: "Start" },
  { id: "product", label: "Product" },
  { id: "operations", label: "Ops" },
  { id: "forecast", label: "Forecast" },
  { id: "path", label: "Path" },
  { id: "pricing", label: "Pricing" },
] as const;

/** Top progress bar + side markers — shows how far through the landing you are. */
export function LandingScrollProgress() {
  const reduced = usePrefersReducedMotion();
  const [progress, setProgress] = useState(0);
  const [activeId, setActiveId] = useState<string>("hero");

  useEffect(() => {
    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const next = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      setProgress(next);

      let current = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= window.innerHeight * 0.35) current = s.id;
      }
      setActiveId(current);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (reduced) return null;

  return (
    <>
      <div
        className="landing-scroll-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-label="Page scroll progress"
      >
        <div
          className="landing-scroll-progress-fill"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>

      <nav
        className="landing-scroll-rail"
        aria-label="Landing sections"
      >
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={cn(
              "landing-scroll-rail-dot",
              activeId === s.id && "is-active"
            )}
            title={s.label}
            aria-label={s.label}
            aria-current={activeId === s.id ? "true" : undefined}
          >
            <span className="sr-only">{s.label}</span>
          </a>
        ))}
        <span className="landing-scroll-rail-pct" aria-hidden>
          {Math.round(progress * 100)}%
        </span>
      </nav>
    </>
  );
}
