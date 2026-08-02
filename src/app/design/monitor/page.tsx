import { redirect } from "next/navigation";
import { isE2eWorkflowHarnessAllowed } from "@/lib/e2e-harness";
import { MonitorDesignGallery } from "@/components/monitor/design/MonitorDesignGallery";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Monitor Design Gallery — TrustTicker",
  robots: { index: false, follow: false },
};

/**
 * Visual design gallery for Monitor tokens/components.
 * Gated like the E2E harness — not a production trader surface.
 */
export default function MonitorDesignGalleryPage() {
  if (!isE2eWorkflowHarnessAllowed()) {
    redirect("/");
  }

  return <MonitorDesignGallery />;
}
