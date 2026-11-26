import type { Metadata } from "next";
import Link from "next/link";
import { PageShell, linkCls } from "@/components/resources/shell";
import { ADLIB_REPORT_PATH } from "@/lib/growth/adlib-report";
import { loadAdlibReport } from "@/lib/growth/adlib-report-server";
import { BENCHMARKS_BASE, benchmarkPath, benchmarkTrades } from "@/lib/growth/organic/benchmarks";
import { breadcrumbJsonLd, graph } from "@/lib/seo/jsonld";

export const revalidate = 86400;
export async function generateMetadata(): Promise<Metadata> {
  const r = await loadAdlibReport();
  const description = `Meta ad benchmarks by trade from the public Ad Library (collected ${r.collectedOn}): live ads per advertiser, how long ads run and how many use an offer, for ${benchmarkTrades(r).length} US local service trades.`;
  return { title: "Local Service Meta Ad Benchmarks by Trade", description, alternates: { canonical: BENCHMARKS_BASE }, robots: r.indexable ? undefined : { index: false, follow: true }, openGraph: { title: "Meta ad benchmarks by trade", description, url: BENCHMARKS_BASE } };
}

export default async function Page() {
  const r = await loadAdlibReport();
  const rows = benchmarkTrades(r).sort((a, b) => b.advertisers - a.advertisers);
  return (
    <PageShell crumbs={[{ name: "Home", href: "/" }, { name: "Reports", href: ADLIB_REPORT_PATH }, { name: "Benchmarks" }]} h1="Meta ad benchmarks by trade" intro={`How US local service advertisers use Facebook and Instagram ads, by trade. Counts from the public Meta Ad Library, collected ${r.collectedOn}.`} campaign="adlib-benchmarks"
      jsonLd={graph(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Local service Meta ads", path: ADLIB_REPORT_PATH }, { name: "Benchmarks", path: BENCHMARKS_BASE }]))}>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-muted-foreground"><tr><th className="py-2 pr-4">Trade</th><th className="pr-4">Advertisers</th><th className="pr-4">Median live ads</th><th className="pr-4">Median days running</th><th>Use an offer</th></tr></thead>
        <tbody>{rows.map((t) => <tr key={t.slug} className="border-t border-border"><td className="py-2 pr-4"><Link className={linkCls} href={benchmarkPath(t.slug)}>{t.label}</Link></td><td className="pr-4">{t.advertisers}</td><td className="pr-4">{t.medianLiveAds}</td><td className="pr-4">{t.medianDays}</td><td>{t.offerShare}%</td></tr>)}</tbody></table></div>
      <section className="mt-10 rounded-xl border border-border p-5 text-sm text-muted-foreground"><h2 className="font-display text-xl font-medium text-foreground">Methodology</h2>
        <p className="mt-2">Source: the public Meta Ad Library, collected {r.collectedOn} for {r.advertisers.toLocaleString("en-US")} US local service advertisers in {r.trades} trades. &quot;Running&quot; is days since the advertiser&apos;s first-seen ad date in the library. These figures describe what advertisers do, not how well their ads perform: the library does not publish results. Trades with fewer than 20 advertisers are left out. Full method and CSV: <Link className={linkCls} href={ADLIB_REPORT_PATH}>State of Local Service Meta Ads</Link>.</p></section>
    </PageShell>
  );
}
