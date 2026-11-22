import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IdeasShell } from "@/components/ad-examples/ideas-shell";
import { Bullets, ChipLinks } from "@/components/ad-examples/playbook-parts";
import { CATEGORIES, FREE_OFFER, IDEAS_BASE, angleLabel, category, categoryAngles, ideasPath, tradeIndustry, tradesIn } from "@/lib/growth/trade-playbooks";

// /ad-examples/ideas/<category>: one broad local-service category (static, from hand-written playbooks).
export const dynamicParams = false;
export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.slug }));
}

type Props = { params: Promise<{ category: string }> };

const desc = (c: NonNullable<ReturnType<typeof category>>) => `${c.label} ad ideas for US ${c.plural}: hook formulas, copy rules, offers, targeting and seasonal ideas, with a playbook for each trade.`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = category((await params).category);
  if (!c) return {};
  const path = ideasPath(c.slug);
  return { title: `${c.label} Ad Ideas & Examples for Facebook and Instagram`, description: desc(c), alternates: { canonical: path }, openGraph: { title: `${c.label} ad ideas`, description: desc(c), url: path } };
}

export default async function CategoryPage({ params }: Props) {
  const c = category((await params).category);
  if (!c) notFound();
  const trades = tradesIn(c.slug);
  const path = ideasPath(c.slug);
  const faq = [
    { q: `How should ${c.plural} target Facebook ads?`, a: c.targeting },
    { q: `Can I get ${c.label.toLowerCase()} ads made for free?`, a: `Yes. Paste your website and Ozzy makes ready-to-run Facebook and Instagram ads from your own brand and offers: ${FREE_OFFER}.` },
  ];
  return (
    <IdeasShell
      crumbs={[{ name: "Home", path: "/" }, { name: "Ad examples", path: "/ad-examples" }, { name: "Ad ideas", path: IDEAS_BASE }, { name: c.label, path }]}
      h1={`${c.label} ad ideas`}
      intro={c.intro}
      description={desc(c)}
      items={trades.map((t) => ({ name: `${t.term} ad examples`, url: `/ad-examples/${t.slug}` }))}
      faq={faq}
      campaign={`ideas-${c.slug}`}
      ctaTitle={`Get 10 free ads for your ${c.label.toLowerCase()} business`}
    >
      <section className="mx-auto mt-14 grid max-w-5xl gap-10 px-4 sm:px-6 md:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl font-medium tracking-[-0.02em]">Hook formulas</h2>
          <Bullets items={c.hookFormulas.map((h) => `${h.name}: ${h.how}`)} />
        </div>
        <div>
          <h2 className="font-display text-2xl font-medium tracking-[-0.02em]">Copy rules</h2>
          <Bullets items={c.copyRules} />
          <h2 className="font-display mt-8 text-2xl font-medium tracking-[-0.02em]">Offers</h2>
          <Bullets items={c.offerRules} />
        </div>
      </section>
      <section className="mx-auto mt-14 max-w-5xl px-4 sm:px-6">
        <h2 className="font-display text-2xl font-medium tracking-[-0.02em] sm:text-3xl">Playbooks by trade</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trades.map((t) => (
            <li key={t.slug} className="rounded-xl border border-border p-5">
              <h3 className="font-semibold capitalize"><Link href={`/ad-examples/${t.slug}`} className="hover:text-[var(--studio-gold)]">{t.term} ad examples</Link></h3>
              <p className="mt-2 text-sm text-muted-foreground">For {tradeIndustry(t).plural}: {t.services.slice(0, 3).join(", ")}.</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="mx-auto mt-14 max-w-5xl px-4 sm:px-6">
        <ChipLinks title="Ideas by angle and season" links={categoryAngles(c.slug).map((a) => ({ href: a.path, label: angleLabel(a.angle) }))} />
      </section>
      <section className="mx-auto mt-14 max-w-3xl px-4 sm:px-6">
        <h2 className="font-display text-2xl font-medium tracking-[-0.02em]">Questions</h2>
        <div className="mt-4 divide-y divide-border rounded-xl border border-border">
          {faq.map((f) => <details key={f.q} className="px-5 py-4"><summary className="cursor-pointer list-none font-medium">{f.q}</summary><p className="mt-2 text-sm text-muted-foreground">{f.a}</p></details>)}
        </div>
      </section>
    </IdeasShell>
  );
}
