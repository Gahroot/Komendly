import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs, CtaBlock } from "@/components/ad-examples/parts";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { ADLIB_REPORT_PATH, LEADERBOARD_BASE, getLeaderboard, leaderboardPath, leaderboardTitle } from "@/lib/growth/adlib-report";
import { ADLIB_SNAPSHOT, loadAdlibReport } from "@/lib/growth/adlib-report-server";
import { withSystemUtm } from "@/lib/growth/systems";
import { breadcrumbJsonLd, graph } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site";
import "@/components/studio/studio.css";

// Monthly leaderboard: the still-running ads with the earliest start dates per trade, from the public Meta Ad Library.
// Neutral and factual: no advertiser names, redacted copy excerpt + state + "running since" + Ad Library link.
export const revalidate = 86400;

type PageProps = { params: Promise<{ trade: string }> };

export function generateStaticParams() {
  return ADLIB_SNAPSHOT.leaderboards.map((l) => ({ trade: l.slug }));
}

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const month = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const age = (d: number) => (d >= 365 ? `${(d / 365).toFixed(1)} years` : `${d} days`);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const r = await loadAdlibReport();
  const l = getLeaderboard(r, (await params).trade);
  if (!l) return {};
  const t = `${leaderboardTitle(l)} (${month(r.collectedOn)})`;
  const d = `The ${l.entries.length} still-active ${l.singular} ads with the earliest start dates in the public Meta Ad Library, out of ${l.advertisers} US advertisers we sampled. Copy excerpts, state and start date; updated monthly.`;
  return { title: t, description: d, alternates: { canonical: leaderboardPath(l.slug) }, robots: l.indexable ? undefined : { index: false, follow: true }, openGraph: { title: t, description: d, url: leaderboardPath(l.slug) } };
}

export default async function LongestRunningTrade({ params }: PageProps) {
  const r = await loadAdlibReport();
  const l = getLeaderboard(r, (await params).trade);
  if (!l) notFound();
  const path = leaderboardPath(l.slug);
  const others = r.leaderboards.filter((x) => x.slug !== l.slug && x.indexable);
  const u = new URL(withSystemUtm(`${SITE_URL}/free-ads`, "data_report", { campaign: `longest-running-${l.slug}`, content: "end", medium: "report" }));
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <JsonLd data={graph(
        breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Ad examples", path: "/ad-examples" }, { name: "Longest-running ads", path: LEADERBOARD_BASE }, { name: l.label, path }]),
        { "@type": "ItemList", name: leaderboardTitle(l), numberOfItems: l.entries.length, itemListElement: l.entries.map((e) => ({ "@type": "ListItem", position: e.rank, name: `${l.singular} ad in ${e.state}, running since ${e.since}`, url: e.libraryUrl })) },
      )} />
      <StudioNav signedIn={false} />
      <main className="px-4 pb-10 sm:px-6">
        <article className="mx-auto max-w-3xl pt-8 sm:pt-14">
          <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Ad examples", href: "/ad-examples" }, { name: "Longest-running ads", href: LEADERBOARD_BASE }, { name: l.label }]} />
          <h1 className="font-display mt-5 text-balance text-[2.2rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-5xl">{leaderboardTitle(l)}</h1>
          <p className="mt-5 text-muted-foreground sm:text-lg">
            The {l.entries.length} still-active {l.singular} ads with the earliest start dates we found in the public Meta Ad Library, out of {l.advertisers} US {l.label.toLowerCase()} we sampled
            (median ad age across all {l.advertisers}: {l.medianDays} days). An ad that keeps running is one its owner chose to keep live; the list says nothing about spend or results.
          </p>
          <p className="mt-4 rounded-xl border border-[var(--studio-gold)]/40 bg-[var(--studio-gold)]/[0.06] px-4 py-3 text-sm">
            <strong>Data:</strong> public Meta Ad Library, collected {month(r.collectedOn)} by Komendly · <strong>n =</strong> {l.advertisers} advertisers · Updated monthly · Names, websites, phones, addresses and towns are left out of the excerpts.
          </p>
          <ol className="mt-10 space-y-5">
            {l.entries.map((e) => (
              <li key={e.rank} className="rounded-2xl border border-border bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-display text-2xl text-[var(--studio-gold)]">#{e.rank}</span>
                  <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">{l.singular} · {e.state} · running since {fmtDate(e.since)} ({age(e.days)})</span>
                </div>
                <blockquote className="mt-3 text-pretty text-muted-foreground">“{e.excerpt}”</blockquote>
                <a href={e.libraryUrl} rel="nofollow noopener" target="_blank" className="mt-3 inline-block text-sm text-[var(--studio-gold)] hover:underline">See it in the Meta Ad Library</a>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-sm text-muted-foreground">
            How we rank: days from the ad&apos;s “started running” date to {r.collectedOn}, the collection date, longest first; one ad per advertiser. Some links open the Ad Library search for the keyword we used rather than the single ad.
            Full numbers by trade and state: <Link href={ADLIB_REPORT_PATH} className="text-[var(--studio-gold)] hover:underline">State of Local Service Meta Ads</Link>.
            {l.playbook && <> Ad ideas for this trade: <Link href={`/ad-examples/${l.playbook}`} className="text-[var(--studio-gold)] hover:underline">{l.singular} ad examples</Link>.</>}
          </p>
          {others.length > 0 && (
            <nav className="mt-12" aria-label="Other trades">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Longest-running ads in other trades</h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {others.map((x) => <li key={x.slug}><Link href={leaderboardPath(x.slug)} className="inline-flex rounded-full border border-border px-3.5 py-1.5 text-sm text-muted-foreground hover:border-[var(--studio-gold)] hover:text-foreground">{x.label}</Link></li>)}
              </ul>
            </nav>
          )}
        </article>
        <div className="py-16"><CtaBlock title={`Fresh ads for your ${l.singular} business`} campaign={`longest-running-${l.slug}`} content="end" label="Make 10 free ads" href={`${u.pathname}${u.search}`} /></div>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
