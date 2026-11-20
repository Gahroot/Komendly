// Shared blocks for the local-service ad library (trade pages + /ad-examples/ideas pages).
import Link from "next/link";
import type { SampleAd } from "@/lib/growth/industry-examples";

export const chip = "inline-flex rounded-full border border-border px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-[var(--studio-gold)] hover:text-foreground";

/** Template ad Ozzy wrote: placeholders only, never a business name. */
export function TemplateAdCard({ ad }: { ad: SampleAd }) {
  return (
    <li className="studio-frame flex flex-col gap-3 rounded-xl p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-medium">{ad.business} <span className="text-muted-foreground">· written by Ozzy</span></p>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Template</span>
      </div>
      <p className="text-sm italic text-foreground/80">{ad.hook}</p>
      <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{ad.primaryText}</p>
      <div className="mt-auto flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
        <p className="text-sm font-semibold">{ad.headline}</p>
        <span className="shrink-0 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium">{ad.cta}</span>
      </div>
      <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground/80">Why it works: </span>{ad.angle}</p>
    </li>
  );
}

export function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-4 space-y-2.5">
      {items.map((p) => <li key={p} className="flex gap-3 text-muted-foreground"><span aria-hidden className="mt-2 inline-block size-1.5 shrink-0 rotate-45 bg-[var(--studio-gold)]" />{p}</li>)}
    </ul>
  );
}

export function Faq({ items }: { items: ReadonlyArray<{ q: string; a: string }> }) {
  return (
    <section className="mx-auto mt-20 max-w-3xl px-4 sm:px-6" aria-labelledby="faq-title">
      <h2 id="faq-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Questions</h2>
      <div className="mt-6 divide-y divide-border rounded-xl border border-border">
        {items.map((f) => (
          <details key={f.q} className="group px-5 py-4">
            <summary className="cursor-pointer list-none font-medium marker:hidden">{f.q}</summary>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function ChipLinks({ title, links }: { title: string; links: ReadonlyArray<{ href: string; label: string }> }) {
  if (!links.length) return null;
  return (
    <div>
      <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">{title}</h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {links.map((l) => <li key={l.href}><Link href={l.href} className={chip}>{l.label}</Link></li>)}
      </ul>
    </div>
  );
}

/** Paid plan line: honest, no promised results. */
export function PaidNote() {
  return (
    <p className="mx-auto mt-6 max-w-2xl px-4 text-center text-sm text-muted-foreground">
      Want it done for you? <Link href="/ads/pricing" className="text-[var(--studio-gold)] hover:underline">Ozzy Ad Department</Link> is $97 for the first month, then $197/mo: your ads go live in your own Meta account and the losers get replaced every week.
    </p>
  );
}
