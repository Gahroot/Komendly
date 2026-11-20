import type { Metadata } from "next";
import Link from "next/link";
import { IdeasShell } from "@/components/ad-examples/ideas-shell";
import { ChipLinks } from "@/components/ad-examples/playbook-parts";
import { CATEGORIES, IDEAS_BASE, PLAYBOOKS, angleLabel, categoryAngles, ideasPath, tradesIn } from "@/lib/growth/trade-playbooks";

// /ad-examples/ideas: the local-service ad library hub (categories -> angle pages + trade pages). Static content.
const DESCRIPTION = `Free ad ideas for ${PLAYBOOKS.length} US local-service trades: hooks, ad copy templates, offer ideas and seasonal ideas (Black Friday, spring, back-to-school, tax season and more).`;

export const metadata: Metadata = {
  title: "Local Service Ad Ideas: Hooks, Copy, Offers & Seasonal Ideas",
  description: DESCRIPTION,
  alternates: { canonical: IDEAS_BASE },
  openGraph: { title: "Local service ad ideas", description: DESCRIPTION, url: IDEAS_BASE },
};

export default function IdeasHub() {
  return (
    <IdeasShell
      crumbs={[{ name: "Home", path: "/" }, { name: "Ad examples", path: "/ad-examples" }, { name: "Ad ideas", path: IDEAS_BASE }]}
      h1="Ad ideas for local service businesses"
      intro="Hooks, copy templates, offers and seasonal ideas for US home service, health and beauty, auto, professional and food businesses. Pick your category, then your trade."
      description={DESCRIPTION}
      items={CATEGORIES.map((c) => ({ name: `${c.label} ad ideas`, url: ideasPath(c.slug) }))}
      campaign="ideas"
      ctaTitle="Skip the blank page: get ads made from your website"
    >
      <section className="mx-auto mt-14 max-w-5xl space-y-12 px-4 sm:px-6">
        {CATEGORIES.map((c) => (
          <div key={c.slug} className="rounded-xl border border-border p-6">
            <h2 className="font-display text-2xl font-medium tracking-[-0.02em]"><Link href={ideasPath(c.slug)} className="hover:text-[var(--studio-gold)]">{c.label} ad ideas</Link></h2>
            <p className="mt-2 text-sm text-muted-foreground">{c.intro}</p>
            <div className="mt-5 grid gap-6 md:grid-cols-2">
              <ChipLinks title="By angle and season" links={categoryAngles(c.slug).map((a) => ({ href: a.path, label: angleLabel(a.angle) }))} />
              <ChipLinks title="By trade" links={tradesIn(c.slug).map((p) => ({ href: `/ad-examples/${p.slug}`, label: `${p.term} ads` }))} />
            </div>
          </div>
        ))}
      </section>
    </IdeasShell>
  );
}
