"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { Button } from "./ui/button";

export function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:shadow-emerald-500/50 transition-shadow">
            <Zap className="w-4 h-4 text-black" />
          </div>
          <span className="font-bold text-lg tracking-tight">
            Ticker<span className="text-emerald-400">Trust</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-zinc-400">
          <Link href="/#features" className="hover:text-zinc-100 transition-colors">Features</Link>
          <Link href="/pricing" className="hover:text-zinc-100 transition-colors">Pricing</Link>
          <Link href="/legal/disclaimer" className="hover:text-zinc-100 transition-colors">Legal</Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">Log in</Button>
          </Link>
          <Link href="/pricing">
            <Button size="sm">Start Free Trial</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
