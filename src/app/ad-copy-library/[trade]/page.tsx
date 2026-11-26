import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/resources/copy-button";
import { PageShell, RelatedLinks } from "@/components/resources/shell";
import { ANGLE_LABEL, COPY_LIBRARY, copyFor } from "@/lib/growth/organic/copy-library";
import { COPY_LIBRARY_BASE } from "@/lib/growth/organic/registry";
import { PLAYBOOKS } from "@/lib/growth/trade-playbooks-data";
import { ideasPath } from "@/lib/growth/trade-playbooks";
import { breadcrumbJsonLd, graph } from "@/lib/seo/jsonld";

export const revalidate = 3600;
export const dynamicParams = false;
export function generateStaticParams() { return COPY_LIBRARY.map((c) => ({ trade: c.slug })); }
const term = (slug: string) => PLAYBOOKS.find((p) => p.slug === slug)?.term ?? slug;

export async function generateMetadata({ params }: { params: Promise<{ trade: string }> }): Promise<Metadata> {
  const { trade } = await params;
  const c = copyFor(trade); if (!c) return {};
  const path = `${COPY_LIBRARY_BASE}/${trade}`;
  const title = `${term(trade)} Ad Headlines and Ad Copy Examples`;
  const description = `${c.headlines.length} ${term(trade)} ad headlines and ${c.primaryTexts.length} ready-to-edit ad texts for Facebook and Instagram, grouped by angle: problem, offer, proof, local, urgency and question.`;
  return { title, description, alternates: { canonical: path }, openGraph: { title, description, url: path } };
}

export default async function Page({ params }: { params: Promise<{ trade: string }> }) {
  const { trade } = await params;
  const c = copyFor(trade); if (!c) notFound();
  const p = PLAYBOOKS.find((x) => x.slug === trade)!;
  const path = `${COPY_LIBRARY_BASE}/${trade}`;
  const t = term(trade);
  return (
    <PageShell crumbs={[{ name: "Home", href: "/" }, { name: "Ad copy library", href: COPY_LIBRARY_BASE }, { name: t }]} h1={`${t.charAt(0).toUpperCase() + t.slice(1)} ad headlines and copy`} intro={`Headlines stay under 40 characters so they are not cut off on mobile. Fill the [brackets] with your own details and only claim what is true for you.`} campaign={`copy-${trade}`}
      jsonLd={graph(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Ad copy library", path: COPY_LIBRARY_BASE }, { name: t, path }]))}>
      <h2 className="font-display text-2xl font-medium">Headlines</h2>
      <ul className="mt-4 space-y-2">{c.headlines.map((h) => <li key={h.text} className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"><span><span className="mr-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--studio-gold)]">{ANGLE_LABEL[h.angle]}</span>{h.text}</span><CopyButton text={h.text} /></li>)}</ul>
      <h2 className="font-display mt-10 text-2xl font-medium">Primary text</h2>
      <ul className="mt-4 space-y-3">{c.primaryTexts.map((x) => <li key={x} className="flex items-start justify-between gap-3 rounded-lg border border-border px-4 py-3"><span>{x}</span><CopyButton text={x} /></li>)}</ul>
      <h2 className="font-display mt-10 text-2xl font-medium">Hooks and offers common in {t}</h2>
      <p className="mt-2 text-sm text-muted-foreground">From our {t} playbook. Peak demand: {p.peak}</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">{[...p.hooks.slice(0, 3), ...p.offers.map((o) => o.replace(/\s*\([^)]*\)/g, ""))].map((x) => <li key={x}>{x}</li>)}</ul>
      <RelatedLinks items={[{ href: `/ad-examples/${trade}`, label: `${t} ad examples` }, { href: ideasPath(p.category), label: "Ad ideas for this group" }, { href: "/tools/marketing-offer-generator", label: "Offer generator" }, { href: "/tools/ad-character-counter", label: "Check lengths" }, { href: "/ad-inspiration", label: "Search all ideas" }]} />
    </PageShell>
  );
}
