import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IdeasShell } from "@/components/ad-examples/ideas-shell";
import { ChipLinks, Faq } from "@/components/ad-examples/playbook-parts";
import { IDEAS_BASE, anglePage, anglePairs, angleLabel, categoryAngles, ideasPath } from "@/lib/growth/trade-playbooks";
import { galleryPageFor } from "@/lib/growth/ad-pages";

// /ad-examples/ideas/<category>/<angle>: hooks / ad copy / offer ideas / seasonal ideas for one category (static).
export const dynamicParams = false;
export function generateStaticParams() {
  return anglePairs().map((x) => ({ category: x.category, angle: x.angle }));
}

type Props = { params: Promise<{ category: string; angle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, angle } = await params;
  const a = anglePage(category, angle);
  if (!a) return {};
  return { title: a.title, description: a.description, alternates: { canonical: a.path }, openGraph: { title: a.title, description: a.description, url: a.path } };
}

export default async function AnglePageRoute({ params }: Props) {
  const { category, angle } = await params;
  const a = anglePage(category, angle);
  if (!a) notFound();
  const occasion = a.season?.occasion ? galleryPageFor("occasion", a.season.occasion) : undefined;
  return (
    <IdeasShell
      crumbs={[{ name: "Home", path: "/" }, { name: "Ad examples", path: "/ad-examples" }, { name: "Ad ideas", path: IDEAS_BASE }, { name: a.category.label, path: ideasPath(a.category.slug) }, { name: angleLabel(a.angle), path: a.path }]}
      h1={a.h1}
      intro={a.intro}
      description={a.description}
      items={a.rows.map((r) => ({ name: `${r.trade.term} ad examples`, url: `/ad-examples/${r.trade.slug}` }))}
      faq={a.faq}
      campaign={`ideas-${a.category.slug}-${a.angle}`}
      ctaTitle="Get ads like these made from your website"
    >
      <section className="mx-auto mt-14 max-w-5xl px-4 sm:px-6">
        <ul className="grid gap-4 sm:grid-cols-2">
          {a.points.map((p) => <li key={p.title} className="rounded-xl border border-border p-5"><h2 className="font-semibold">{p.title}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.detail}</p></li>)}
        </ul>
      </section>
      <section className="mx-auto mt-16 max-w-5xl px-4 sm:px-6">
        <h2 className="font-display text-2xl font-medium tracking-[-0.02em] sm:text-3xl">{a.rowsTitle}</h2>
        <div className="mt-6 space-y-6">
          {a.rows.map((r) => (
            <div key={r.trade.slug} className="rounded-xl border border-border p-5">
              <h3 className="font-semibold capitalize"><Link href={`/ad-examples/${r.trade.slug}`} className="hover:text-[var(--studio-gold)]">{r.industry.plural}</Link></h3>
              <ul className="mt-3 space-y-2">{r.items.map((it) => <li key={it} className="text-sm leading-relaxed text-muted-foreground">{it}</li>)}</ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Placeholders in [brackets] are yours to fill in. Only advertise offers you really run.</p>
      </section>
      <Faq items={a.faq} />
      <section className="mx-auto mt-16 max-w-5xl px-4 sm:px-6">
        <ChipLinks title={`More ${a.category.label.toLowerCase()} ad ideas`} links={[...categoryAngles(a.category.slug).filter((x) => x.path !== a.path).map((x) => ({ href: x.path, label: angleLabel(x.angle) })), ...(occasion ? [{ href: occasion.path, label: occasion.entry.h1 }] : [])]} />
      </section>
    </IdeasShell>
  );
}
