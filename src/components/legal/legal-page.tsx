import type { ReactNode } from "react";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import "@/components/studio/studio.css";

export const LEGAL_EFFECTIVE_DATE = "7 November 2026";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Static shell for /privacy and /terms: no session read, so the page is publicly cacheable. */
export function LegalPage({ title, intro, sections }: { title: string; intro: ReactNode; sections: readonly LegalSection[] }) {
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <StudioNav signedIn={false} />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Effective {LEGAL_EFFECTIVE_DATE}</p>
        <h1 className="font-display mt-4 text-[2.3rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-5xl">{title}</h1>
        <div className="mt-5 text-base text-muted-foreground">{intro}</div>
        <nav aria-label="Contents" className="mt-8 rounded-xl border border-border p-5">
          <ol className="grid gap-1.5 text-sm sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id}><a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground">{i + 1}. {s.title}</a></li>
            ))}
          </ol>
        </nav>
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="mt-10 scroll-mt-24">
            <h2 id={`${s.id}-h`} className="font-display text-2xl font-medium tracking-[-0.02em]">{i + 1}. {s.title}</h2>
            <div className="legal-body mt-3 space-y-3 text-sm leading-relaxed text-foreground/85 [&_a]:text-[var(--studio-gold)] [&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">{s.body}</div>
          </section>
        ))}
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
