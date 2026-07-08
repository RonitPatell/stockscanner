import { Navbar } from "@/components/Navbar";
import { MarketingLanding } from "@/components/landing/MarketingLanding";
import { auth } from "@/lib/auth";

export default async function HomePage() {
  const session = await auth();
  const displayName = session?.user
    ? session.user.name || session.user.email?.split("@")[0] || "Trader"
    : undefined;

  return (
    <>
      <Navbar />
      <MarketingLanding displayName={displayName} />
    </>
  );
}
