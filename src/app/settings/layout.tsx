import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

/** Server-side gate — do not rely on client-only session checks. */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?next=/settings");
  }
  return children;
}
