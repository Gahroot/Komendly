"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { OzzyLazy } from "@/components/ozzy/OzzyLazy";
import { cn } from "@/lib/utils";

export type AdsNavLink = { href: string; label: string };

/** Hamburger + night sheet for the studio nav below `sm`. Ozzy naps at the bottom. */
export function AdsMobileMenu({ links, cta }: { links: AdsNavLink[]; cta?: AdsNavLink }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-10 sm:hidden" aria-label="Open menu"><Menu className="size-5" /></Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-[82vw] max-w-xs flex-col">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <span aria-hidden className="inline-block size-2.5 rotate-45 bg-[var(--studio-gold)] shadow-[0_0_12px_#ffcf4a99]" />
            Komendly
          </SheetTitle>
          <SheetDescription className="sr-only">Site navigation</SheetDescription>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              aria-current={pathname === l.href ? "page" : undefined}
              className={cn(
                "flex h-12 items-center rounded-xl px-3 text-base font-medium transition-colors hover:bg-accent",
                pathname === l.href ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              {l.label}
            </Link>
          ))}
          {cta && (
            <Link href={cta.href} onClick={() => setOpen(false)} className="spellbar__cta mt-4 inline-flex h-12 items-center justify-center rounded-2xl font-semibold">
              {cta.label}
            </Link>
          )}
        </nav>
        <div className="mt-auto flex items-end justify-center pb-6 opacity-90">
          {open && <OzzyLazy size={96} perch="ground" speech={false} pose={{ form: "chill", expression: "sleepy", motion: "sleep" }} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
