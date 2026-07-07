import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "bullish" | "bearish" | "neutral" | "urgent";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium border",
        {
          "bg-zinc-800 text-zinc-300 border-zinc-700": variant === "default",
          "bg-emerald-500/15 text-emerald-400 border-emerald-500/30": variant === "bullish",
          "bg-red-500/15 text-red-400 border-red-500/30": variant === "bearish",
          "bg-zinc-800 text-zinc-400 border-zinc-700": variant === "neutral",
          "bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse": variant === "urgent",
        },
        className
      )}
      {...props}
    />
  );
}
