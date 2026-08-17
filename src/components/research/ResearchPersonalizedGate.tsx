"use client";

import { AccessGate } from "@/components/access/AccessGate";
import type { AccessState } from "@/lib/subscription";

/**
 * Research personalized actions — delegates to AccessGate.
 * mode="login" → anonymous; mode="subscribe" → expired (or pass state).
 * Optional title/body override AccessGate copy when provided.
 */
export function ResearchPersonalizedGate({
  mode,
  state,
  nextPath = "/dashboard?view=research",
  title,
  body,
  feature = "Research",
}: {
  mode?: "login" | "subscribe";
  state?: AccessState;
  nextPath?: string;
  title?: string;
  body?: string;
  feature?: string;
}) {
  void nextPath;

  const resolved: AccessState =
    state ?? (mode === "login" ? "anonymous" : "expired");

  return (
    <div
      data-testid={
        resolved === "anonymous"
          ? "research-login-gate"
          : "research-subscribe-gate"
      }
    >
      <AccessGate
        state={resolved}
        feature={feature}
        title={title}
        body={body}
        compact
      />
    </div>
  );
}
