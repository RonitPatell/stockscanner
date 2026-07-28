import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { VisualSystemGallery } from "@/components/visual-system/VisualSystemGallery";
import { BrandHomeLink } from "@/components/BrandHomeLink";

/**
 * Authenticated component gallery for trader UI visual QA.
 * Fixtures only — no user-owned data, no secrets.
 */
export default async function GalleryPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?next=/gallery");
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-ink)]/95 backdrop-blur">
        <BrandHomeLink />
        <span className="tt-meta">·</span>
        <span className="tt-meta">Visual system</span>
        <Link
          href="/dashboard?shell=v3"
          className="ml-auto text-[13px] tt-tone-brand hover:underline"
        >
          Back to dashboard
        </Link>
      </header>
      <VisualSystemGallery />
    </div>
  );
}
