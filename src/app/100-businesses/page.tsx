import type { Metadata } from "next";
import Link from "next/link";
import { HubShell } from "@/components/hubs/hub-shell";
import { progressView } from "@/lib/growth/creative-hubs";
import { progressCounts } from "@/lib/growth/creative-hubs-server";

export const revalidate = 300;
export const metadata: Metadata = { title: "100 businesses in 100 days: live progress", description: "Real counts of the free ad gifts Komendly has made for businesses, straight from our database.", alternates: { canonical: "/100-businesses" } };

export default async function Page() {
  const { startedAt, counts } = await progressCounts().catch(() => ({ startedAt: null, counts: { made: 0, delivered: 0, viewed: 0, claimed: 0 } }));
  const v = progressView(counts, startedAt, new Date());
  const rows: Array<[string, number, string]> = [["Gift ad packs started", v.made, "Packs we began for a business's own website."], ["Packs ready", v.delivered, "Finished and viewable by that business."], ["Opened by the business", v.viewed, "A real person opened their gift page."], ["Claimed", v.claimed, "The business claimed the ads."]];
  return (
    <HubShell title={`100 businesses in 100 days${v.day ? `: day ${v.day}` : ""}`} lead={`Our goal: make free ads for 100 businesses. These numbers come straight from our database and update every few minutes. We count packs, not results, and we don't round up.${startedAt ? "" : " We haven't counted our first gift yet."}`}>
      <div className="mb-8 h-3 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={v.delivered} aria-valuemin={0} aria-valuemax={v.goal}><div className="h-full bg-[var(--studio-gold)]" style={{ width: `${v.pct}%` }} /></div>
      <dl className="grid gap-4 sm:grid-cols-2">{rows.map(([k, n, d]) => <div key={k} className="rounded-2xl border border-border p-5"><dt className="text-sm text-muted-foreground">{k}</dt><dd className="font-display text-4xl">{n}</dd><p className="mt-1 text-xs text-muted-foreground">{d}</p></div>)}</dl>
      <p className="mt-8 text-sm text-muted-foreground">Want to be one of them? <Link className="underline" href="/makeover">Request a free makeover</Link> or <Link className="underline" href="/nominate">nominate a business</Link>.</p>
    </HubShell>
  );
}
