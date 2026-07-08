"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "./ui/button";
import { UserMenu } from "./UserMenu";
import { LogoMark } from "./Logo";

export function Navbar() {
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated" && !!session?.user;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group transition-transform duration-200 active:scale-[0.98]">
          <LogoMark className="w-8 h-8 group-hover:shadow-emerald-500/50" />
          <span className="font-bold text-lg tracking-tight">
            Trust<span className="text-emerald-400">Ticker</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-zinc-400">
          {!isLoggedIn && (
            <>
              <Link href="/#features" className="hover:text-zinc-100 transition-colors">Features</Link>
              <Link href="/#testimonials" className="hover:text-zinc-100 transition-colors">Reviews</Link>
              <Link href="/pricing" className="hover:text-zinc-100 transition-colors">Pricing</Link>
            </>
          )}
          {isLoggedIn && (
            <>
              <Link href="/#features" className="hover:text-zinc-100 transition-colors">Features</Link>
              <Link href="/#testimonials" className="hover:text-zinc-100 transition-colors">Reviews</Link>
              <Link href="/dashboard" className="hover:text-zinc-100 transition-colors">Scanner</Link>
            </>
          )}
          <Link href="/legal/disclaimer" className="hover:text-zinc-100 transition-colors">Legal</Link>
        </nav>

        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <>
              <Link href="/dashboard" className="hidden sm:block">
                <Button size="sm">Open Scanner</Button>
              </Link>
              <UserMenu />
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">Log in</Button>
              </Link>
              <Link href="/pricing">
                <Button size="sm">Start Free Trial</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
