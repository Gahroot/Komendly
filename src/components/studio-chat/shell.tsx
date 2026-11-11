"use client";
import { Coins, Menu, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { StudioAccountView } from "@/lib/studio/thread";
import { InviteDialog } from "./invite-dialog";
import { SessionRail } from "./rail";
import type { SessionSummary } from "./types";

export function Counters({ account }: { account: StudioAccountView }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {!account.paid && (
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/12 bg-black/25 px-3 text-[oklch(0.95_0.03_80)]" title="Free Studio videos left">
          <Sparkles className="size-3.5 text-[var(--studio-gold)]" aria-hidden /><span className="tabular-nums font-semibold">{account.freeVideosLeft}</span> free
        </span>
      )}
      <Link href="/ads/billing" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/12 bg-black/25 px-3 text-[oklch(0.95_0.03_80)] hover:bg-white/8" title="Ozzy credits">
        <Coins className="size-3.5 text-[var(--studio-gold)]" aria-hidden /><span className="tabular-nums font-semibold">{account.balance}</span> credits
      </Link>
    </div>
  );
}

/** Left rail on desktop, sheet on mobile, header with title + counters. */
export function StudioShell({ sessions, activeId, activeSession, title, account, children }: { sessions: SessionSummary[]; activeId?: string; activeSession?: SessionSummary; title: ReactNode; account: StudioAccountView; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState(false);
  const rail = <SessionRail sessions={sessions} activeId={activeId} active={activeSession} onInvite={() => { setOpen(false); setInvite(true); }} />;
  return (
    <div className="flex h-dvh">
      <aside className="hidden w-72 shrink-0 border-r border-white/8 bg-[oklch(0.13_0.05_290/0.7)] backdrop-blur-xl md:block">{rail}</aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[86vw] max-w-80 p-0">
          <SheetTitle className="sr-only">Studio chats</SheetTitle>
          {rail}
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/8 px-3 sm:px-4">
          <button type="button" className="studio-icon-btn md:hidden" aria-label="Open chats" onClick={() => setOpen(true)}><Menu className="size-5" /></button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-[oklch(0.95_0.03_80)]">{title}</h1>
          <Counters account={account} />
        </header>
        {children}
      </div>
      <InviteDialog open={invite} onOpenChange={setInvite} />
    </div>
  );
}
