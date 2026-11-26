import { COMPETITORS, VERIFIED_ON, type Competitor } from "@/lib/growth/organic/compare";

export function FactList({ c }: { c: Competitor }) {
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {c.facts.map((f) => <li key={f.text} className="rounded-lg border border-border p-3">{f.text} <a className="text-[var(--studio-gold)] hover:underline" href={f.source} target="_blank" rel="noopener nofollow">Source</a></li>)}
    </ul>
  );
}
export const VerifiedNote = () => <p className="mt-8 rounded-xl border border-border p-4 text-sm text-muted-foreground">Competitor details were read from each vendor&apos;s public pages on {VERIFIED_ON}. Plans, prices and features change, so confirm on their site before you decide. Tell us if anything here is out of date and we will fix it.</p>;
export const others = (slug: string) => COMPETITORS.filter((c) => c.slug !== slug);
