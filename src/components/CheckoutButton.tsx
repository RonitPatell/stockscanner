"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CheckoutPlan } from "@/lib/stripe";

interface CheckoutButtonProps {
  children?: React.ReactNode;
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  showIcon?: boolean;
  plan?: CheckoutPlan;
}

export function CheckoutButton({
  children = "Start Free Trial",
  size = "default",
  className,
  showIcon = true,
  plan = "monthly",
}: CheckoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCheckout = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();

      if (res.status === 401) {
        router.push("/login?next=checkout");
        return;
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      setError(data.error || "Could not start checkout. Verify Stripe keys and price ID.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className?.includes("w-full") ? "w-full" : undefined}>
      <Button
        size={size}
        className={className}
        onClick={handleCheckout}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : showIcon ? (
          <CreditCard className="w-4 h-4" />
        ) : null}
        {loading ? "Redirecting to checkout..." : children}
      </Button>
      {error && <p className="text-red-400 text-sm mt-2 text-center">{error}</p>}
    </div>
  );
}
