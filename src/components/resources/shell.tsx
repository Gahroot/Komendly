import type { ReactNode } from "react";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs, CtaBlock } from "@/components/ad-examples/parts";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { organicCtaHref } from "@/lib/growth/organic/registry";
import "@/components/studio/studio.css";

/** Common public page frame for the organic resources: nav, breadcrumbs, H1, body, CTA with UTM to the free pack, footer. */
export function PageShell({ crumbs, h1, intro, jsonLd, campaign, children }: { crumbs: Array<{ name: string; href?: string }>; h1: string; intro?: string; jsonLd: Record<string, unknown>; campaign: string; children: ReactNode }) {
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <JsonLd data={jsonLd} />
      <StudioNav signedIn={false} />
      <main className="px-4 sm:px-6">
        <header className="mx-auto max-w-3xl pt-8 text-center sm:pt-14">
          <div className="flex justify-center"><Breadcrumbs items={crumbs} /></div>
          <h1 className="font-display mt-5 text-balance text-[2.1rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-5xl">{h1}</h1>
          {intro && <p className="mx-auto mt-5 max-w-2xl text-muted-foreground sm:text-lg">{intro}</p>}
        </header>
        <div className="mx-auto mt-10 max-w-3xl">{children}</div>
        <div className="py-16"><CtaBlock title="Get free ads from your website" campaign={campaign} content="end" label="Make my free ads" href={organicCtaHref(campaign, "end")} /></div>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}

export function Faq({ items }: { items: Array<{ q: string; a: string }> }) {
  return (
    <section className="mt-14" aria-labelledby="faq-title">
      <h2 id="faq-title" className="font-display text-2xl font-medium sm:text-3xl">Questions</h2>
      <div className="mt-6 divide-y divide-border rounded-xl border border-border">
        {items.map((f) => <details key={f.q} className="px-5 py-4"><summary className="cursor-pointer list-none font-medium">{f.q}</summary><p className="mt-2 text-sm text-muted-foreground">{f.a}</p></details>)}
      </div>
    </section>
  );
}

export const linkCls = "text-[var(--studio-gold)] hover:underline";
export function RelatedLinks({ items }: { items: Array<{ href: string; label: string }> }) {
  return <nav className="mt-12" aria-label="Related"><ul className="flex flex-wrap gap-2">{items.map((i) => <li key={i.href}><Link href={i.href} className="inline-flex rounded-full border border-border px-3.5 py-1.5 text-sm text-muted-foreground hover:text-foreground">{i.label}</Link></li>)}</ul></nav>;
}
