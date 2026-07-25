"use client";

import { useId, useState, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Tiny “?” that explains a control without cluttering the desk. */
export function HelpTip({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute z-50 left-0 top-full mt-1 w-64 max-w-[80vw] rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-[12px] leading-snug text-zinc-300 shadow-xl"
        >
          <span className="block font-semibold text-zinc-100 mb-1">{title}</span>
          {children}
        </span>
      )}
    </span>
  );
}
