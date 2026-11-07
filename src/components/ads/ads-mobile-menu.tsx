"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type AdsNavLink = { href: string; label: string };

/** Hamburger + sheet for the ads nav below `sm`. */
export function AdsMobileMenu({ links, cta }: { links: AdsNavLink[]; cta?: AdsNavLink }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Open menu"><Menu /></Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle>Komendly <span className="text-muted-foreground">Ads</span></SheetTitle>
          <SheetDescription className="sr-only">Site navigation</SheetDescription>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              aria-current={pathname === l.href ? "page" : undefined}
              className={cn("rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent", pathname === l.href ? "bg-accent text-foreground" : "text-muted-foreground")}
            >
              {l.label}
            </Link>
          ))}
          {cta && <Button asChild className="mt-3"><Link href={cta.href} onClick={() => setOpen(false)}>{cta.label}</Link></Button>}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
