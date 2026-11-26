import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell, linkCls } from "@/components/resources/shell";
import { ADLIB_REPORT_PATH, leaderboardPath } from "@/lib/growth/adlib-report";
import { ADLIB_SNAPSHOT, loadAdlibReport } from "@/lib/growth/adlib-report-server";
import { BENCHMARKS_BASE, benchmarkPath, benchmarkTrades, describeDelta, tradeBenchmark } from "@/lib/growth/organic/benchmarks";
import { breadcrumbJsonLd, graph } from "@/lib/seo/jsonld";

export const revalidate = 86400;
export const dynamicParams = false;
export function generateStaticParams() { return benchmarkTrades(ADLIB_SNAPSHOT).map((t) => ({ trade: t.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ trade: string }> }): Promise<Metadata> {
  const r = await loadAdlibReport();
  const b = tradeBenchmark(r, (await params).trade); if (!b) return {};
  const t = b.trade; const path = benchmarkPath(t.slug);
  const description = `${t.label} on Meta: ${t.advertisers} US advertisers in the Ad Library, median ${t.medianLiveAds} live ad${t.medianLiveAds === 1 ? "" : "s"}, ads running a median ${t.medianDays} days, ${t.offerShare}% use an offer (collected ${r.collectedOn}).`;
  return { title: `${t.label} Meta Ad Benchmarks`, description, alternates: { canonical: path }, robots: r.indexable ? undefined : { index: false, follow: true }, openGraph: { title: `${t.label} Meta ad benchmarks`, description, url: path } };
}

export default async function Page({ params }: { params: Promise<{ trade: string }> }) {
  const r = await loadAdlibReport();
  const b = tradeBenchmark(r, (await params).trade); if (!b) notFound();
  const t = b.trade; const path = benchmarkPath(t.slug);
  const stats: Array<[string, string, string]> = [
    ["Median live ads per advertiser", String(t.medianLiveAds), describeDelta(b.liveAds, "")],
    ["Median days an advertiser has been running ads", String(t.medianDays), describeDelta(b.medianDays, " days")],
    ["Running 1 year or more", `${t.over365Share}%`, describeDelta(b.over365, " points")],
    ["Ads that include an offer", `${t.offerShare}%`, describeDelta(b.offer, " points")],
  ];
  const lb = r.leaderboards.find((l) => l.slug === t.slug && l.indexable);
  return (
    <PageShell crumbs={[{ name: "Home", href: "/" }, { name: "Reports", href: ADLIB_REPORT_PATH }, { name: "Benchmarks", href: BENCHMARKS_BASE }, { name: t.label }]} h1={`${t.label}: Meta ad benchmarks`} intro={`Based on ${t.advertisers} US ${t.label.toLowerCase()} advertisers found in the public Meta Ad Library, collected ${r.collectedOn}. This trade ranks #${b.rank.byAdvertisers} of ${b.rank.of} by number of advertisers.`} campaign={`benchmark-${t.slug}`}
      jsonLd={graph(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Local service Meta ads", path: ADLIB_REPORT_PATH }, { name: "Benchmarks", path: BENCHMARKS_BASE }, { name: t.label, path }]))}>
      <ul className="grid gap-4 sm:grid-cols-2">{stats.map(([l, v, d]) => <li key={l} className="rounded-xl border border-border p-5"><p className="font-display text-3xl text-[var(--studio-gold)]">{v}</p><p className="mt-1 text-sm">{l}</p><p className="mt-2 text-xs text-muted-foreground">{d}</p></li>)}</ul>
      <section className="mt-10 rounded-xl border border-border p-5 text-sm text-muted-foreground"><h2 className="font-display text-xl font-medium text-foreground">How to read this</h2>
        <p className="mt-2">Most advertisers in this trade run a small number of ads and keep them live for a long time, so you do not need a big library to start. These are counts of what advertisers do. The Ad Library does not publish results, so this is not a measure of which ads work.</p>
        {t.topSignal && <p className="mt-2">The most common writing pattern in this trade: &quot;{t.topSignal}&quot; ({t.topSignalShare}% of advertisers).</p>}
        <p className="mt-2">Methodology: public Meta Ad Library, collected {r.collectedOn}, {r.advertisers.toLocaleString("en-US")} advertisers across all trades. Full method and CSV: <Link className={linkCls} href={ADLIB_REPORT_PATH}>State of Local Service Meta Ads</Link>.</p></section>
      <nav className="mt-8 flex flex-wrap gap-2 text-sm" aria-label="Related">
        {lb && <Link className={linkCls} href={leaderboardPath(t.slug)}>Longest-running {t.label.toLowerCase()} ads</Link>}
        {t.playbook && <Link className={linkCls} href={`/ad-examples/${t.playbook}`}>{t.label} ad examples</Link>}
        <Link className={linkCls} href={BENCHMARKS_BASE}>All trades</Link>
      </nav>
    </PageShell>
  );
}
