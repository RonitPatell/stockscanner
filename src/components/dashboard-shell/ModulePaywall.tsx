"use client";

import Link from "next/link";
import { CheckoutButton } from "@/components/CheckoutButton";

export function ModulePaywall({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  /** @deprecated Ignored */
  tier?: string;
  cta?: string;
}) {
  return (
    <div
      className="max-w-lg mx-auto my-10 rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 text-center space-y-4"
      data-testid="module-paywall"
    >
      <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
      <p className="text-sm text-zinc-400 leading-relaxed">{body}</p>
      <CheckoutButton billingPeriod="monthly" className="w-full justify-center">
        {cta ?? "Start free trial"}
      </CheckoutButton>
      <p className="text-[11px] text-zinc-500">
        <Link href="/pricing" className="text-emerald-400 hover:underline">
          View pricing
        </Link>
      </p>
    </div>
  );
}
