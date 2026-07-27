"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "./Logo";
import { cn } from "@/lib/utils";

/**
 * Logo + wordmark home link. Scrolls to top when already on `/`.
 */
export function BrandHomeLink({
  className,
  showText = true,
  iconClassName,
  textClassName,
}: {
  className?: string;
  showText?: boolean;
  iconClassName?: string;
  textClassName?: string;
}) {
  const pathname = usePathname();

  return (
    <Link
      href="/"
      prefetch={pathname !== "/"}
      onClick={(e) => {
        if (pathname === "/") {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }}
      className={cn(
        "flex items-center gap-2 hover:opacity-90 transition-opacity shrink-0",
        className
      )}
    >
      <LogoMark className={cn("w-7 h-7", iconClassName)} />
      {showText && (
        <span
          className={cn("font-semibold tracking-tight text-[15px]", textClassName)}
          style={{
            fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
          }}
        >
          Trust<span className="text-[var(--accent-bright)]">Ticker</span>
        </span>
      )}
    </Link>
  );
}
