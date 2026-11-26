import type { ReactNode } from "react";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import "@/components/studio/studio.css";

/** Shared page frame for the creative hubs (dark Studio theme, one centred column). */
export function HubShell({ title, lead, children, wide = false }: { title: string; lead?: string; children?: ReactNode; wide?: boolean }) {
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <StudioNav signedIn={false} />
      <main className={`mx-auto ${wide ? "max-w-5xl" : "max-w-2xl"} px-4 pb-20 pt-10 sm:px-6 sm:pt-16`}>
        <h1 className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-5xl">{title}</h1>
        {lead && <p className="mt-4 text-base text-muted-foreground sm:text-lg">{lead}</p>}
        {children && <div className="mt-8">{children}</div>}
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
export const hubBtn = "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--studio-gold)] px-6 font-semibold text-[#2a0f10] transition hover:brightness-105 disabled:opacity-60";
