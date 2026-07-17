"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { startCheckout } from "@/lib/start-checkout";
import { Button } from "@/components/ui/button";

export function SubscribeRedirect() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);

  const runCheckout = async (retries = 3) => {
    setRetrying(true);
    setError("");

    const result = await startCheckout();
    if (result.ok) {
      window.location.assign(result.url);
      return;
    }

    if (result.status === 401 && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return runCheckout(retries - 1);
    }

    if (result.status === 401) {
      router.replace("/login?next=checkout");
      return;
    }

    setError(result.error || "Could not start checkout. Verify Stripe keys in your environment.");
    setRetrying(false);
  };

  useEffect(() => {
    runCheckout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md space-y-4">
          <h1 className="text-xl font-semibold">Checkout unavailable</h1>
          <p className="text-red-400 text-sm">{error}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={() => runCheckout()} disabled={retrying}>
              {retrying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Try again"}
            </Button>
            <Link href="/dashboard">
              <Button variant="outline">Back to dashboard</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-zinc-400">
      <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
      <p>Redirecting to secure checkout...</p>
    </div>
  );
}
