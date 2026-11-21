import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/ad-examples/parts";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { ADLIB_REPORT_PATH, LEADERBOARD_BASE, leaderboardPath } from "@/lib/growth/adlib-report";
import { loadAdlibReport } from "@/lib/growth/adlib-report-server";
import { breadcrumbJsonLd, graph } from "@/lib/seo/jsonld";
import "@/components/studio/studio.css";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const r = await loadAdlibReport();
  const d = `Monthly leaderboards of the longest-running Facebook & Instagram ads from ${r.advertisers.toLocaleString("en-US")} US local service businesses in the public Meta Ad Library, by trade.`;
  return { title: "Longest-Running Local Service Ads by Trade", description: d, alternates: { canonical: LEADERBOARD_BASE }, robots: r.indexable ? undefined : { index: false, follow: true } };
}

export default async function LongestRunningHub() {
  const r = await loadAdlibReport();
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <JsonLd data={graph(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Ad examples", path: "/ad-examples" }, { name: "Longest-running ads", path: LEADERBOARD_BASE }]))} />
      <StudioNav signedIn={false} />
      <main className="px-4 pb-20 sm:px-6">
        <article className="mx-auto max-w-3xl pt-8 sm:pt-14">
          <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Ad examples", href: "/ad-examples" }, { name: "Longest-running ads" }]} />
          <h1 className="font-display mt-5 text-balance text-[2.2rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-5xl">Longest-running local service ads by trade</h1>
          <p className="mt-5 text-muted-foreground sm:text-lg">Still-active ads with the earliest start dates in the public Meta Ad Library, per trade. Data collected {r.collectedOn} by Komendly; updated monthly. Numbers behind them: <Link href={ADLIB_REPORT_PATH} className="text-[var(--studio-gold)] hover:underline">State of Local Service Meta Ads</Link>.</p>
          <ul className="mt-10 grid gap-3 sm:grid-cols-2">
            {r.leaderboards.map((l) => (
              <li key={l.slug}><Link href={leaderboardPath(l.slug)} className="block rounded-xl border border-border p-4 hover:border-[var(--studio-gold)]"><span className="font-semibold">{l.label}</span><span className="mt-1 block text-sm text-muted-foreground">n = {l.advertisers} · median ad age {l.medianDays} days</span></Link></li>
            ))}
          </ul>
        </article>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
