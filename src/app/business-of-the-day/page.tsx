import type { Metadata } from "next";
import Link from "next/link";
import { HubShell } from "@/components/hubs/hub-shell";
import { latestBotd, publishEnabled } from "@/lib/growth/creative-hubs-server";

export const revalidate = 600;
export async function generateMetadata(): Promise<Metadata> {
  const picks = (await publishEnabled().catch(() => false)) ? await latestBotd().catch(() => []) : [];
  return { title: "Ozzy's business of the day", description: "A small business that opted in to be featured, with the ads it chose to share.", alternates: { canonical: "/business-of-the-day" }, robots: picks.length === 0 ? { index: false, follow: true } : undefined };
}

export default async function Page() {
  const picks = (await publishEnabled().catch(() => false)) ? await latestBotd().catch(() => []) : [];
  const [today, ...past] = picks;
  return (
    <HubShell title="Ozzy's business of the day" lead="Only businesses that opted in appear here, and only with the ads they chose to share. No one is ever featured without saying yes.">
      {!today ? <p className="text-muted-foreground">Nobody is featured yet. <Link className="underline" href="/showcase">See opt-in showcases</Link>.</p> : (
        <>
          <div className="rounded-2xl border border-border p-6"><p className="text-xs uppercase tracking-wide text-muted-foreground">{today.day}</p><h2 className="font-display text-3xl">{today.title}</h2><p className="mt-2 text-muted-foreground">{today.blurb}</p><Link className="mt-4 inline-block underline" href={`/showcase/${today.slug}`}>See their ads</Link></div>
          {past.length > 0 && <ul className="mt-8 space-y-2 text-sm">{past.map((p) => <li key={p.day}><span className="text-muted-foreground">{p.day}</span> · <Link className="underline" href={`/showcase/${p.slug}`}>{p.title}</Link></li>)}</ul>}
        </>
      )}
      <p className="mt-8 text-sm text-muted-foreground">Customers can opt in from their Komendly account under Showcase.</p>
    </HubShell>
  );
}
