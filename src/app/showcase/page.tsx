import type { Metadata } from "next";
import Link from "next/link";
import { HubShell } from "@/components/hubs/hub-shell";
import { listShowcases, publishEnabled } from "@/lib/growth/creative-hubs-server";

export const revalidate = 600;
export async function generateMetadata(): Promise<Metadata> {
  const rows = (await publishEnabled().catch(() => false)) ? await listShowcases().catch(() => []) : [];
  return { title: "Customer showcase", description: "Ad portfolios from Komendly customers who chose to share them.", alternates: { canonical: "/showcase" }, robots: rows.length === 0 ? { index: false, follow: true } : undefined };
}

export default async function Page() {
  const rows = (await publishEnabled().catch(() => false)) ? await listShowcases().catch(() => []) : [];
  return (
    <HubShell title="Customer showcase" lead="Portfolios published only by the businesses themselves. Opt-in, and they can switch it off any time.">
      {rows.length === 0 ? <p className="text-muted-foreground">No showcases yet.</p> : <ul className="grid gap-4 sm:grid-cols-2">{rows.map((r) => <li key={r.slug}><Link className="block rounded-2xl border border-border p-5 hover:bg-white/[0.04]" href={`/showcase/${r.slug}`}><span className="font-display text-xl">{r.title}</span>{r.blurb && <span className="mt-1 block text-sm text-muted-foreground">{r.blurb}</span>}</Link></li>)}</ul>}
    </HubShell>
  );
}
