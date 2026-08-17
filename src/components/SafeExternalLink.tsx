"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { safeHttpUrl } from "@/lib/utils";

type Props = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  href: string | null | undefined;
  children: ReactNode;
  /** When URL is unsafe, render children without a link (default) or nothing. */
  fallback?: "children" | "null";
};

/**
 * External link that only renders http(s) hrefs — blocks javascript:/data:/etc.
 */
export function SafeExternalLink({
  href,
  children,
  className,
  fallback = "children",
  ...rest
}: Props) {
  const safe = safeHttpUrl(href);
  if (!safe) {
    return fallback === "null" ? null : <>{children}</>;
  }
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      {...rest}
    >
      {children}
    </a>
  );
}
