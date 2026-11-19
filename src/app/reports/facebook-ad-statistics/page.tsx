import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs, CtaBlock } from "@/components/ad-examples/parts";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { MIN_INDEXABLE_SITES, MIN_SITES_FOR_TERM, REPORT_PATH, type AdReport } from "@/lib/growth/ad-report";
import { loadAdReport } from "@/lib/growth/ad-report-server";
import { breadcrumbJsonLd, dataReportJsonLd, graph } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site";
import "@/components/studio/studio.css";

// Public data report. Stats are recomputed from the DB (read-only) at most once a day; noindex until the sample is big enough.
export const revalidate = 86400;

const PUBLISHED = "2026-11-19";
const CSV_PATH = `${REPORT_PATH}/data.csv`;
const URL = `${SITE_URL}${REPORT_PATH}`;

const title = (r: AdReport) => `Facebook Ad Creative Statistics: ${r.ads} AI-Made Ads From Small-Business Websites`;
const description = (r: AdReport) =>
  `Original data on ${r.ads} Facebook & Instagram ads our AI made from ${r.sites} real small-business websites: headline length, questions vs statements, numbers and offers, CTA verbs, brand colours and image sizes. Free CSV, updated daily.`;

export async function generateMetadata(): Promise<Metadata> {
  const r = await loadAdReport();
  return {
    title: title(r),
    description: description(r),
    alternates: { canonical: REPORT_PATH },
    robots: r.indexable ? undefined : { index: false, follow: true },
    openGraph: { title: title(r), description: description(r), url: REPORT_PATH, type: "article" },
  };
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white/[0.03] p-5">
      <div className="font-display text-3xl font-medium text-[var(--studio-gold)]">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => <h2 id={id} className="font-display mt-14 text-2xl font-medium sm:text-3xl">{children}</h2>;
const A = ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href} className="text-[var(--studio-gold)] hover:underline" rel="noopener">{children}</a>;

export default async function AdReportPage() {
  const r = await loadAdReport();
  const updated = r.to ?? PUBLISHED;
  const range = r.from && r.to ? `${r.from} to ${r.to}` : "no data yet";
  const citation = `Komendly (${updated.slice(0, 4)}). Facebook Ad Creative Statistics: ${r.ads} AI-Made Ads From Small-Business Websites. Retrieved from ${URL}`;
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <JsonLd data={graph(
        breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Ad examples", path: "/ad-examples" }, { name: "Facebook ad statistics", path: REPORT_PATH }]),
        ...dataReportJsonLd({
          path: REPORT_PATH, csvPath: CSV_PATH, headline: title(r), description: description(r), datePublished: PUBLISHED, dateModified: updated,
          temporalCoverage: r.from && r.to ? `${r.from}/${r.to}` : PUBLISHED,
          keywords: ["facebook ad statistics", "facebook ad creative statistics", "small business advertising statistics", "ad headline length", "call to action statistics"],
          variables: r.tables.map((t) => t.title),
        }),
      )} />
      <StudioNav signedIn={false} />
      <main className="px-4 pb-10 sm:px-6">
        <article className="mx-auto max-w-3xl pt-8 sm:pt-14">
          <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Ad examples", href: "/ad-examples" }, { name: "Facebook ad statistics" }]} />
          <h1 className="font-display mt-5 text-balance text-[2.2rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-5xl">Facebook ad creative statistics: {r.ads} AI-made ads from {r.sites} small-business websites</h1>
          <p className="mt-5 text-muted-foreground sm:text-lg">
            Small business ad statistics from our own data: what {r.ads} Facebook &amp; Instagram ads look like when they are built from real small businesses&apos; websites.
            Every number below is recomputed from our database once a day, so the report grows with the sample.
          </p>
          <p className="mt-4 rounded-xl border border-[var(--studio-gold)]/40 bg-[var(--studio-gold)]/[0.06] px-4 py-3 text-sm">
            <strong>Sample:</strong> {r.ads} finished ads for {r.sites} websites · <strong>Dates:</strong> {range} · <strong>Last updated:</strong> {updated} · <a href={CSV_PATH} className="text-[var(--studio-gold)] hover:underline">Download the CSV</a>
          </p>
          {!r.indexable && <p className="mt-4 text-sm text-muted-foreground">This report is still filling up (under {MIN_INDEXABLE_SITES} websites), so treat the numbers as early.</p>}

          <H2 id="findings">Key findings</H2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Stat value={`${r.headline.medianWords} words`} label={`Median headline length (${r.headline.medianChars} characters); ${r.headline.under40Chars}% fit in 40 characters`} />
            <Stat value={`${r.headline.question}%`} label="of headlines are questions; the rest are statements" />
            <Stat value={`${r.hook.firstPerson}%`} label="of opening hooks are written in the buyer's own voice (I / my)" />
            <Stat value={`${r.headline.number}%`} label={`of headlines contain a number; ${r.headline.price}% a price, ${r.headline.offer}% an offer`} />
            <Stat value={r.cta.topVerb ? `“${r.cta.topVerb}”` : "n/a"} label={`most common CTA verb (${r.cta.topVerbShare}% of ads); median CTA is ${r.cta.medianWords} words`} />
            <Stat value={r.topRatio ?? "n/a"} label={`aspect ratio of ${r.topRatioShare}% of finished images; ${r.topColorFamily ?? "n/a"} is the top brand colour (${r.topColorShare}% of sites)`} />
          </div>
          <p className="mt-6 text-muted-foreground">
            In short: the ads that come out of real small-business websites are short (most headlines are 7 to 9 words), lead with a specific buyer thought rather than a discount,
            and almost never mention a price or a sale, because most of these businesses sell services and want leads, not one-click purchases.
          </p>

          <H2 id="tables">The data</H2>
          {r.tables.map((t) => (
            <section key={t.id} className="mt-8" aria-labelledby={`t-${t.id}`}>
              <h3 id={`t-${t.id}`} className="text-lg font-semibold">{t.title}</h3>
              {t.rows.length ? (
                <div className="mt-3 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-white/[0.04] text-muted-foreground"><tr>{t.columns.map((c) => <th key={c} scope="col" className="px-3 py-2 font-medium">{c}</th>)}</tr></thead>
                    <tbody>{t.rows.map((row, i) => <tr key={i} className="border-t border-border">{row.map((v, j) => <td key={j} className="px-3 py-2">{v}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              ) : <p className="mt-2 text-sm text-muted-foreground">Not enough websites share a value yet to show it without identifying anyone.</p>}
            </section>
          ))}

          <H2 id="methodology">Methodology</H2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-muted-foreground">
            <li><strong>What the ads are:</strong> static Facebook &amp; Instagram ads that Komendly&apos;s AI (Ozzy) wrote and designed from each business&apos;s own website: its offer, audience, brand colours and photos. They describe what website-based ads look like, not what any business ran or how ads performed (we don&apos;t report click or sales results here).</li>
            <li><strong>Which websites count:</strong> sites of real customers who made ads themselves, plus real small businesses whose public website our outreach turned into a free sample ad pack ({r.outreachShare}% of sites). Runs by our own staff, test and demo accounts (the same internal-account rule as our revenue dashboard) and our own or test domains are excluded. Fictional demo businesses used on our example pages are never counted.</li>
            <li><strong>One vote per website:</strong> if a website was processed more than once, only its latest completed run counts.</li>
            <li><strong>Which ads count:</strong> only finished static ads that passed our automatic quality check; drafts, failed and animated ads are left out.</li>
            <li><strong>How things are measured:</strong> words are split on spaces; “question” means the text contains a question mark; “number” means any digit; “price” means a currency sign next to a number; “offer” means words like free, % off, discount, deal or sale; colour family is the hue of the site&apos;s main brand colour. Some sites are not in English and are counted as written.</li>
            <li><strong>Privacy:</strong> only aggregates are published. A CTA phrase or hook word is shown only when it appears on {MIN_SITES_FOR_TERM} or more different websites, so no business can be identified.</li>
            <li><strong>Limits:</strong> industry is not classified yet, so we don&apos;t break results down by industry. The hook words partly reflect how our AI is told to write (the buyer&apos;s private thought before buying).</li>
            <li><strong>Updates:</strong> the page and CSV are recomputed daily. It is kept out of search indexes until at least {MIN_INDEXABLE_SITES} websites are in the sample.</li>
          </ul>

          <H2 id="platforms">What the platforms say</H2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-muted-foreground">
            <li>Meta&apos;s <A href="https://www.facebook.com/business/ads-guide/update/image">Ads Guide for image ads</A> lists the recommended image sizes and text lengths per placement (feed, Stories, Reels), including vertical 4:5 for feed and 9:16 for Stories and Reels.</li>
            <li>Google&apos;s help page on <A href="https://support.google.com/google-ads/answer/7005917">responsive display ads</A> lists the image sizes Google wants for display ads (1.91:1 landscape, 1200×628, and square, 1200×1200) plus its text limits; note that neither is the 4:5 or 9:16 shape Meta feeds and Stories favour.</li>
          </ul>

          <H2 id="cite">How to cite this report</H2>
          <p className="mt-4 text-muted-foreground">You are welcome to use these numbers (CC BY 4.0). Please link to this page:</p>
          <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-border bg-white/[0.04] p-4 text-sm">{citation}</pre>
          <p className="mt-3 text-sm text-muted-foreground">Stable URL: <a href={REPORT_PATH} className="text-[var(--studio-gold)] hover:underline">{URL}</a> · Data: <a href={CSV_PATH} className="text-[var(--studio-gold)] hover:underline">{`${URL}/data.csv`}</a></p>

          <p className="mt-12 text-muted-foreground">
            Want to see real ads instead of numbers? Browse <Link href="/ad-examples" className="text-[var(--studio-gold)] hover:underline">Facebook ad examples by industry</Link> or
            try the free <Link href="/tools" className="text-[var(--studio-gold)] hover:underline">ad tools</Link>.
          </p>
        </article>
        <div className="py-16"><CtaBlock title="Get 10 free ads for your business" campaign="ad-report" content="end" label="Make yours free" /></div>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
