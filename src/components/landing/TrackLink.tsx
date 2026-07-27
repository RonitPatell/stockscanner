"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import type { FunnelEvent } from "@/lib/analytics/track";

/** Privacy-safe funnel click — posts scrubbed event, then navigates normally. */
export function TrackLink({
  event,
  props,
  href,
  children,
  className,
  ...rest
}: {
  event: FunnelEvent;
  props?: Record<string, string | number | boolean>;
  href: string;
  children: React.ReactNode;
  className?: string;
} & Omit<ComponentProps<typeof Link>, "href" | "onClick" | "children">) {
  return (
    <Link
      href={href}
      className={className}
      {...rest}
      onClick={() => {
        void fetch("/api/analytics/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, props }),
        }).catch(() => {});
      }}
    >
      {children}
    </Link>
  );
}
