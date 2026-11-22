import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs, CtaBlock } from "@/components/ad-examples/parts";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { ADLIB_REPORT_PATH, MIN_ADVERTISERS_FOR_TERM, MIN_GROUP, MIN_INDEXABLE_ADVERTISERS, MIN_LEADERBOARD_ADVERTISERS, leaderboardPath, type AdlibReport, type Bucket } from "@/lib/growth/adlib-report";
import { loadAdlibReport } from "@/lib/growth/adlib-report-server";
import { withSystemUtm } from "@/lib/growth/systems";
import { breadcrumbJsonLd, dataReportJsonLd, graph } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site";
import "@/components/studio/studio.css";

// Public data report from the committed Ad Library snapshot (refreshed monthly; see scripts/build-adlib-report.ts).
export const revalidate = 86400;

const PUBLISHED = "2026-11-21";
const CSV_PATH = `${ADLIB_REPORT_PATH}/data.csv`;
const URL = `${SITE_URL}${ADLIB_REPORT_PATH}`;

const fmt = (n: number) => n.toLocaleString("en-US");
const monthLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const title = (r: AdlibReport) => `State of Local Service Meta Ads (${monthLabel(r.collectedOn)}): ${fmt(r.advertisers)} US Advertisers`;
const description = (r: AdlibReport) =>
  `Original data on ${fmt(r.advertisers)} US local service businesses running Facebook & Instagram ads, from the public Meta Ad Library: live ads per advertiser (median ${r.liveAds.median}), how long ads run (median ${r.runDays.median} days), offers and hook words, by trade and state. Free CSV.`;
const ctaHref = (content: string) => { const u = new globalThis.URL(withSystemUtm(`${SITE_URL}/free-ads`, "data_report", { campaign: "local-service-meta-ads", content, medium: "report" })); return `${u.pathname}${u.search}`; };

export async function generateMetadata(): Promise<Metadata> {
  const r = await loadAdlibReport();
  return {
    title: title(r),
    description: description(r),
    alternates: { canonical: ADLIB_REPORT_PATH },
    robots: r.indexable ? undefined : { index: false, follow: true },
    openGraph: { title: title(r), description: description(r), url: ADLIB_REPORT_PATH, type: "article" },
  };
}

function Stat({ value, label, n }: { value: string; label: string; n: number }) {
  return (
    <div className="rounded-2xl border border-border bg-white/[0.03] p-5">
      <div className="font-display text-3xl font-medium text-[var(--studio-gold)]">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/80">n = {fmt(n)} advertisers</div>
    </div>
  );
}

const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => <h2 id={id} className="font-display mt-14 text-2xl font-medium sm:text-3xl">{children}</h2>;
const Gold = ({ href, children }: { href: string; children: React.ReactNode }) => <Link href={href} className="text-[var(--studio-gold)] hover:underline">{children}</Link>;

function Table({ id, title, n, columns, rows }: { id: string; title: string; n: number; columns: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <section className="mt-8" aria-labelledby={`t-${id}`}>
      <h3 id={`t-${id}`} className="text-lg font-semibold">{title} <span className="font-mono text-xs font-normal text-muted-foreground">(n = {fmt(n)})</span></h3>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.04] text-muted-foreground"><tr>{columns.map((c) => <th key={c} scope="col" className="px-3 py-2 font-medium">{c}</th>)}</tr></thead>
          <tbody>{rows.map((row, i) => <tr key={i} className="border-t border-border">{row.map((v, j) => <td key={j} className="px-3 py-2">{v}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
const bucketRows = (bs: Bucket[]) => bs.map((b) => [b.label, fmt(b.advertisers), `${b.share}%`]);

export default async function LocalServiceMetaAdsReport() {
  const r = await loadAdlibReport();
  const month = monthLabel(r.collectedOn);
  const citation = `Komendly (${r.collectedOn.slice(0, 4)}). State of Local Service Meta Ads (${month}): ${fmt(r.advertisers)} US advertisers. Data: public Meta Ad Library. Retrieved from ${URL}`;
  const topTrades = [...r.byTrade].sort((a, b) => b.medianDays - a.medianDays);
  const longest = topTrades[0], shortest = topTrades.at(-1);
  const topSignal = r.signals.rows.find((s) => s.id !== "emoji");
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <JsonLd data={graph(
        breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Ad examples", path: "/ad-examples" }, { name: "State of Local Service Meta Ads", path: ADLIB_REPORT_PATH }]),
        ...dataReportJsonLd({
          path: ADLIB_REPORT_PATH, csvPath: CSV_PATH, headline: title(r), description: description(r), datePublished: PUBLISHED, dateModified: r.generatedAt.slice(0, 10),
          temporalCoverage: r.firstSeenFrom ? `${r.firstSeenFrom}/${r.collectedOn}` : r.collectedOn,
          keywords: ["local service business facebook ads", "meta ad library data", "facebook ad statistics by industry", "how long do facebook ads run", "home services advertising statistics", "med spa facebook ads", "dental facebook ads"],
          variables: ["Live ads per advertiser", "Days the sampled ad has been running", "Offer and hook signals in ad copy", "Most common ad words", "By trade", "By US state"],
        }),
      )} />
      <StudioNav signedIn={false} />
      <main className="px-4 pb-10 sm:px-6">
        <article className="mx-auto max-w-3xl pt-8 sm:pt-14">
          <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Ad examples", href: "/ad-examples" }, { name: "State of Local Service Meta Ads" }]} />
          <h1 className="font-display mt-5 text-balance text-[2.2rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-5xl">State of Local Service Meta Ads: what {fmt(r.advertisers)} US local businesses run on Facebook &amp; Instagram</h1>
          <p className="mt-5 text-muted-foreground sm:text-lg">
            We looked up {fmt(r.advertisers)} US local service businesses (plumbers, roofers, dentists, med spas, auto shops, lawyers and more) with active ads in the public Meta Ad Library,
            across {r.trades} trades and {r.states} states. Below: how many ads they keep live, how long their ads run, and which offers and words show up most. Aggregates only; no business is named.
          </p>
          <p className="mt-4 rounded-xl border border-[var(--studio-gold)]/40 bg-[var(--studio-gold)]/[0.06] px-4 py-3 text-sm">
            <strong>Data:</strong> public Meta Ad Library, collected {month} by Komendly · <strong>Sample:</strong> {fmt(r.advertisers)} advertisers ({r.trades} trades, {r.states} states) · <strong>Collected:</strong> {r.collectedOn} · <a href={CSV_PATH} className="text-[var(--studio-gold)] hover:underline">Download the CSV</a>
          </p>
          {!r.indexable && <p className="mt-4 text-sm text-muted-foreground">This report is still filling up (under {MIN_INDEXABLE_ADVERTISERS} advertisers), so treat the numbers as early.</p>}

          <H2 id="findings">Key findings</H2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Stat value={`${r.liveAds.median} live ad${r.liveAds.median === 1 ? "" : "s"}`} label={`median per advertiser (mean ${r.liveAds.mean}); ${r.liveAds.buckets[0]?.share ?? 0}% run just one ad, ${r.liveAds.multiAdShare}% run two or more`} n={r.liveAds.n} />
            <Stat value={`${r.runDays.median} days`} label={`median time the sampled ad had been running (middle half: ${r.runDays.p25}–${r.runDays.p75} days)`} n={r.runDays.n} />
            <Stat value={`${r.runDays.over90Share}%`} label={`had an ad running 90+ days; ${r.runDays.over365Share}% for a year or more`} n={r.runDays.n} />
            <Stat value={`${r.signals.offerShare}%`} label="of ads mention an offer (free, a dollar price, a percentage or deal words)" n={r.signals.n} />
            {topSignal && <Stat value={`${topSignal.share}%`} label={topSignal.label.toLowerCase()} n={r.signals.n} />}
            {longest && shortest && <Stat value={`${longest.medianDays} vs ${shortest.medianDays} days`} label={`median ad age: ${longest.label.toLowerCase()} (n=${longest.advertisers}) vs ${shortest.label.toLowerCase()} (n=${shortest.advertisers})`} n={longest.advertisers + shortest.advertisers} />}
          </div>
          <p className="mt-6 text-muted-foreground">
            In short: most local service businesses on Meta run a single ad and leave it up for months. The typical ad we sampled had been live for {r.runDays.median} days,
            and only {r.liveAds.multiAdShare}% of advertisers had more than one ad running, so few are testing several creatives at once.
          </p>

          <H2 id="live-ads">How many ads they keep live</H2>
          <Table id="live" title="Active ads per advertiser" n={r.liveAds.n} columns={["Live ads", "Advertisers", "Share"]} rows={bucketRows(r.liveAds.buckets)} />
          <p className="mt-3 text-sm text-muted-foreground">Median {r.liveAds.median}, mean {r.liveAds.mean}, 75th percentile {r.liveAds.p75}, 90th percentile {r.liveAds.p90}.</p>

          <H2 id="run-time">How long ads run</H2>
          <Table id="days" title="Days the sampled ad had been running when collected" n={r.runDays.n} columns={["Running for", "Advertisers", "Share"]} rows={bucketRows(r.runDays.buckets)} />
          <p className="mt-3 text-sm text-muted-foreground">
            Median {r.runDays.median} days; {r.runDays.over30Share}% at least 30 days. See the <Gold href="/ad-examples/longest-running">longest-running local ads by trade</Gold>.
          </p>

          <H2 id="format">Video vs image</H2>
          {r.media ? (
            <p className="mt-4 text-muted-foreground">{r.media.videoShare}% video, {r.media.imageShare}% image, {r.media.otherShare}% other (n = {fmt(r.media.n)} advertisers).</p>
          ) : (
            <p className="mt-4 text-muted-foreground">Not measured in this snapshot: the collection recorded one ad&apos;s text per advertiser, not its format. We will add the video/image split when a collection records it.</p>
          )}

          <H2 id="offers">Offers and hooks in the ad copy</H2>
          <Table id="signals" title={`What the ad text contains (shown when ${MIN_ADVERTISERS_FOR_TERM}+ advertisers use it)`} n={r.signals.n} columns={["Signal", "Advertisers", "Share"]} rows={r.signals.rows.map((s) => [s.label, fmt(s.advertisers), `${s.share}%`])} />
          <Table id="words" title={`Most common words in the ads (used by ${MIN_ADVERTISERS_FOR_TERM}+ advertisers; filler and business names removed)`} n={r.words.n} columns={["Word", "Advertisers", "Share"]} rows={r.words.rows.map((w) => [w.word, fmt(w.advertisers), `${w.share}%`])} />

          <H2 id="by-trade">By trade</H2>
          <Table id="trades" title={`Trades with ${MIN_GROUP}+ advertisers`} n={r.byTrade.reduce((n, t) => n + t.advertisers, 0)}
            columns={["Trade", "Advertisers", "Median live ads", "Median days running", "Running 90+ days", "Mentions an offer", "Most common signal"]}
            rows={r.byTrade.map((t) => [<Link key={t.slug} href={leaderboardPath(t.slug)} className="text-[var(--studio-gold)] hover:underline">{t.label}</Link>, fmt(t.advertisers), t.medianLiveAds, t.medianDays, `${t.over90Share}%`, `${t.offerShare}%`, t.topSignal ? `${t.topSignal} (${t.topSignalShare}%)` : "n/a"])} />

          <H2 id="by-state">By state</H2>
          <Table id="states" title={`States with ${MIN_GROUP}+ advertisers`} n={r.byState.reduce((n, s) => n + s.advertisers, 0)}
            columns={["State", "Advertisers", "Median live ads", "Median days running", "Running 90+ days"]}
            rows={r.byState.map((s) => [s.state, fmt(s.advertisers), s.medianLiveAds, s.medianDays, `${s.over90Share}%`])} />

          <H2 id="methodology">Methodology</H2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-muted-foreground">
            <li><strong>Source:</strong> the public <a href="https://www.facebook.com/ads/library/" className="text-[var(--studio-gold)] hover:underline" rel="noopener">Meta Ad Library</a>, searched in {month} with trade keywords (for example “roof replacement”, “med spa special”, “auto repair coupon”), US only, active ads only. Komendly is not affiliated with Meta.</li>
            <li><strong>Who counts:</strong> US local service businesses advertising themselves with their own website. Agencies, national brands and franchise headquarters, lead-gen directories and political advertisers were skipped. One row per Facebook page (duplicates removed); rows without a valid state, start date or live-ad count were dropped.</li>
            <li><strong>Live ads:</strong> the number of active ads the Ad Library showed for the advertiser at collection time.</li>
            <li><strong>How long ads run:</strong> days from the “started running” date of the advertiser&apos;s sampled active ad to the collection date ({r.collectedOn}). The ad was still running, so this is a minimum, not a finished run length. Sampled start dates range from {r.firstSeenFrom ?? "n/a"} to {r.firstSeenTo ?? "n/a"}.</li>
            <li><strong>Copy signals:</strong> measured on one ad text sample per advertiser (the first ~200 characters). “Offer” = the word free, a dollar price, a percentage, or deal words (special, deal, discount, save, sale, promo, coupon). Word counts are per advertiser, not per ad.</li>
            <li><strong>Sample sizes and privacy:</strong> every number shows its n. Trades and states appear only with {MIN_GROUP}+ advertisers; a word or signal only when {MIN_ADVERTISERS_FOR_TERM}+ advertisers use it. No business names, pages or websites are published here.</li>
            <li><strong>Limits:</strong> keyword search favours advertisers whose copy uses those words, so this is a large convenience sample, not a census. The report says nothing about spend or results; the Ad Library does not publish them for these ads.</li>
            <li><strong>Updates:</strong> re-collected and recomputed monthly. The report is indexed only with {MIN_INDEXABLE_ADVERTISERS}+ advertisers; a trade leaderboard only with {MIN_LEADERBOARD_ADVERTISERS}+.</li>
          </ul>

          <H2 id="cite">How to cite this report</H2>
          <p className="mt-4 text-muted-foreground">You are welcome to use these numbers (CC BY 4.0). Please link to this page:</p>
          <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-border bg-white/[0.04] p-4 text-sm">{citation}</pre>
          <p className="mt-3 text-sm text-muted-foreground">Stable URL: <a href={ADLIB_REPORT_PATH} className="text-[var(--studio-gold)] hover:underline">{URL}</a> · Data: <a href={CSV_PATH} className="text-[var(--studio-gold)] hover:underline">{`${URL}/data.csv`}</a></p>

          <p className="mt-12 text-muted-foreground">
            More data: our <Gold href="/reports/facebook-ad-statistics">Facebook ad creative statistics</Gold>. Want ideas instead of numbers? Browse <Gold href="/ad-examples">ad examples by trade</Gold>.
          </p>
        </article>
        <div className="py-16"><CtaBlock title="Get fresh ads for your business" campaign="local-service-meta-ads" content="end" label="Make 10 free ads" href={ctaHref("end")} /></div>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
