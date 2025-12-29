"use client";

import Link from "next/link";
import Image from "next/image";

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-800 py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="Komendly" width={24} height={24} className="h-6 w-6" />
            <span className="text-lg font-bold tracking-wide">KOMENDLY</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-zinc-500">
            <Link href="/pricing" className="transition-colors hover:text-white">
              Pricing
            </Link>
            <Link href="/blog" className="transition-colors hover:text-white">
              Blog
            </Link>
          </div>
          <p className="text-sm text-zinc-500">
            &copy; {new Date().getFullYear()} Komendly. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
