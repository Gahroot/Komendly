import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HubShell } from "@/components/hubs/hub-shell";
import { ShareLink } from "@/components/hubs/share-link";
import { seasonWindowLabel } from "@/lib/growth/creative-hubs";
import { PLAYBOOKS, SEASONS, ideasPath, season } from "@/lib/growth/trade-playbooks";

export const revalidate = 3600;
type P = { params: Promise<{ season: string }> };
export const generateStaticParams = () => SEASONS.map((s) => ({ season: s.key }));

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const s = season((await params).season);
  if (!s) return { title: "Not found", robots: { index: false } };
  return { title: `${s.name} ad ideas by industry`, description: `${s.name} ad ideas for local service trades. Start window ${seasonWindowLabel(s.key)}.`, alternates: { canonical: `/seasonal/${s.key}` } };
}

export default async function Page({ params }: P) {
  const s = season((await params).season);
  if (!s) notFound();
  const rows = PLAYBOOKS.flatMap((p) => (p.seasonal[s.key] ? [{ p, idea: p.seasonal[s.key]! }] : []));
  return (
    <HubShell wide title={`${s.name} ad ideas by industry`} lead={`${s.name}: ${s.when}. ${s.timing} Start window: ${seasonWindowLabel(s.key)}.`}>
      <ul className="grid gap-3 sm:grid-cols-2">{rows.map(({ p, idea }) => <li key={p.slug} className="rounded-2xl border border-border p-4"><Link className="font-medium underline" href={ideasPath(p.category, s.key)}>{p.term}</Link><p className="mt-1 text-sm text-muted-foreground">{idea}</p></li>)}</ul>
      <div className="mt-8 flex flex-wrap gap-3"><Link href={`/free-ads?utm_source=examples&utm_medium=acquire&utm_campaign=seasonal-${s.key}`} className="inline-flex h-11 items-center rounded-xl bg-[var(--studio-gold)] px-5 font-semibold text-[#2a0f10]">Make my {s.name} ads free</Link><ShareLink url={`/seasonal/${s.key}`} text={`${s.name} ad ideas by industry`} /></div>
    </HubShell>
  );
}
