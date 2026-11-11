"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar, type SidebarWallet } from "@/components/sidebar";
import { BrandMark } from "@/components/brand-mark";

/** Hub chrome: app-switcher sidebar on desktop, sheet on mobile. */
export function HubShell({ wallet, children }: { wallet: SidebarWallet; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-dvh">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-[oklch(0.14_0.06_290/0.6)] backdrop-blur-xl lg:block">
        <Sidebar wallet={wallet} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border px-4 lg:hidden">
          <Link href="/dashboard" className="font-display flex items-center gap-2 text-lg font-semibold">
            <BrandMark className="size-7" />
            Komendly
          </Link>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-11 text-muted-foreground hover:text-foreground">
                <Menu className="size-6" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <Sidebar wallet={wallet} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
        </header>
        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
