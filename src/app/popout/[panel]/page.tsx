import { notFound } from "next/navigation";
import { PopoutWorkspace } from "@/components/PopoutWorkspace";
import { isPopoutPanelId, POPOUT_PANELS } from "@/components/MarketMonitor";

export function generateStaticParams() {
  return Object.keys(POPOUT_PANELS).map((panel) => ({ panel }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ panel: string }>;
}) {
  const { panel } = await params;
  const title = isPopoutPanelId(panel) ? POPOUT_PANELS[panel].title : "Panel";
  return {
    title: `${title} — TrustTicker`,
    robots: { index: false, follow: false },
  };
}

export default async function PopoutPage({
  params,
}: {
  params: Promise<{ panel: string }>;
}) {
  const { panel } = await params;
  if (!isPopoutPanelId(panel)) notFound();

  return <PopoutWorkspace panel={panel} />;
}
