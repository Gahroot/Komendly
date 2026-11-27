// Hand-written Google search ad and TikTok example sections (data + limits in src/lib/growth/local-search-ads.ts).
// Server components. Every example is labelled as made by Komendly's Ozzy; nothing here claims results or that Komendly runs ads.
import Link from "next/link";
import { Bullets } from "@/components/ad-examples/playbook-parts";
import {
  RSA_LIMITS, SEARCH_ASK_FOR, SEARCH_LEAVE_OUT, SEARCH_PUT_IN_AD, TIKTOK_AD_TEXT_MAX, TIKTOK_EXAMPLES, TIKTOK_PUT_IN_AD, TIKTOK_SPECS, TOWN, TOWN_FIT_CHARS, charCount,
  type SearchAd, type SearchGuide, type TikTokExample,
} from "@/lib/growth/local-search-ads";

const h2 = "font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl";
const h3 = "font-display text-xl font-medium tracking-[-0.01em] sm:text-2xl";
const link = "text-[var(--studio-gold)] hover:underline";
const eyebrow = "font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--studio-gold)]";

function CountedLine({ text, max }: { text: string; max: number }) {
  const n = charCount(text);
  return (
    <li className="flex items-start justify-between gap-3 rounded-md bg-white/5 px-3 py-1.5 text-sm">
      <span className="text-foreground/90">{text}</span>
      <span className="shrink-0 pt-0.5 font-mono text-xs text-muted-foreground" aria-label={`${n} of ${max} characters`}>{n}/{max}</span>
    </li>
  );
}

function SearchAdCard({ ad }: { ad: SearchAd }) {
  return (
    <li className="studio-frame flex flex-col gap-4 rounded-xl p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{ad.label}</h3>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Example</span>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">Google search ad (responsive) · example made by Komendly&apos;s Ozzy</p>
      <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground/80">Answers searches like: </span>{ad.searches.map((s) => `"${s}"`).join(", ")}</p>
      <div>
        <p className={eyebrow}>Headlines · {RSA_LIMITS.headline} characters max each</p>
        <ul className="mt-2 space-y-1.5">{ad.headlines.map((h) => <CountedLine key={h} text={h} max={RSA_LIMITS.headline} />)}</ul>
      </div>
      <div>
        <p className={eyebrow}>Descriptions · {RSA_LIMITS.description} characters max each</p>
        <ul className="mt-2 space-y-1.5">{ad.descriptions.map((d) => <CountedLine key={d} text={d} max={RSA_LIMITS.description} />)}</ul>
      </div>
      <p className="text-xs text-muted-foreground">Display path: <span className="font-mono">yourbusiness.com/{ad.path1}/{ad.path2}</span></p>
      <p className="mt-auto text-sm text-muted-foreground"><span className="font-medium text-foreground/80">Why it fits: </span>{ad.why}</p>
    </li>
  );
}

function ServiceCards({ guide }: { guide: SearchGuide }) {
  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2">
      {guide.services.map((s) => (
        <li key={s.name} className="rounded-xl border border-border p-5">
          <h3 className="font-semibold">{s.name}</h3>
          <p className="mt-2 text-sm text-muted-foreground"><span className="font-medium text-foreground/80">People search: </span>{s.searches.map((q) => `"${q}"`).join(", ")}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground"><span className="font-medium text-foreground/80">In the ad: </span>{s.adSays}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Google search ads for one trade. `summary` (the Facebook-led /ad-examples/<trade> page): services + two examples + a link
 * to the full guide. `full` (/ad-examples/<trade>/google): all examples, what to put in the ad, what to ask for.
 */
export function SearchAdsGuide({ guide, mode, googlePath, tools }: { guide: SearchGuide; mode: "summary" | "full"; googlePath: string; tools: { headline: string; counter: string } }) {
  const ads = mode === "full" ? guide.ads : [guide.ads[0]!, guide.ads[2]!];
  return (
    <section id="google-ads" className="mx-auto mt-16 max-w-5xl scroll-mt-24 px-4 sm:px-6" aria-labelledby="google-ads-title">
      <h2 id="google-ads-title" className={h2}>{mode === "full" ? `Google search ad examples for ${guide.who}` : `Google ad examples for ${guide.who}`}</h2>
      <p className="mt-4 max-w-3xl text-muted-foreground">
        Someone typing a problem into Google is ready to call. {mode === "full" ? `Here are four search ads, one for each kind of ${guide.term} search, written as examples by Komendly's Ozzy.` : `Here are two search ads written as examples by Komendly's Ozzy; the full guide has four.`}{" "}
        They aren&apos;t real companies or customer ads and claim no results. {TOWN} stands in for your town and counts as {charCount(TOWN)} characters; every line still fits with a town name up to {TOWN_FIT_CHARS} characters, so recount if yours is longer.
      </p>

      <h3 className={`${h3} mt-10`}>What people search, and what the ad should say</h3>
      <ServiceCards guide={guide} />

      <h3 className={`${h3} mt-12`}>{mode === "full" ? "Four example search ads" : "Two example search ads"}</h3>
      <p className="mt-3 text-sm text-muted-foreground">Each line shows its character count against Google&apos;s limit for responsive search ads ({RSA_LIMITS.headline} for a headline, {RSA_LIMITS.description} for a description). A real ad can hold up to {RSA_LIMITS.maxHeadlines} headlines and {RSA_LIMITS.maxDescriptions} descriptions; Google shows up to 3 headlines and 2 descriptions at a time.</p>
      <ul className="mt-6 grid gap-5 lg:grid-cols-2">{ads.map((a) => <SearchAdCard key={a.label} ad={a} />)}</ul>
      <p className="mt-4 text-sm text-muted-foreground">Same-day, 24/7, free estimate, licensed and insured and price-before-work lines are placeholders: keep each one only if it is true for your business.</p>

      {mode === "summary" ? (
        <p className="mt-6 text-muted-foreground">
          See all four examples, what to put in the ad and what to ask for on <Link href={googlePath} className={link}>Google ads for {guide.who}</Link>. Komendly doesn&apos;t run Google ads: you paste the text into your own Google Ads account.
        </p>
      ) : (
        <>
          <div className="mt-14 grid gap-10 md:grid-cols-2">
            <div>
              <h3 className={h3}>What to put in the ad</h3>
              <Bullets items={SEARCH_PUT_IN_AD} />
            </div>
            <div>
              <h3 className={h3}>What to leave out</h3>
              <Bullets items={SEARCH_LEAVE_OUT} />
              <p className="mt-4 text-sm text-muted-foreground"><span className="font-medium text-foreground/80">Negative keywords to start with: </span>{guide.negatives.join(", ")}. Check the search terms report weekly and add more.</p>
            </div>
          </div>
          <div className="mt-12 rounded-xl border border-border p-6">
            <h3 className={h3}>What to ask for if someone else sets up your Google Ads</h3>
            <p className="mt-3 text-sm text-muted-foreground">If you hire an agency or a freelancer, these are fair things to ask for in writing before you start.</p>
            <Bullets items={SEARCH_ASK_FOR} />
          </div>
          <p className="mt-8 text-muted-foreground">
            Write your own lines with the free <Link href={tools.headline} className={link}>Google Ads headline generator</Link>, which keeps to these limits, and check any line with the <Link href={tools.counter} className={link}>ad character counter</Link>. Komendly doesn&apos;t run or post Google ads: you paste the text into your own Google Ads account.
          </p>
        </>
      )}
    </section>
  );
}

function TikTokCard({ ex }: { ex: TikTokExample }) {
  return (
    <li className="studio-frame flex flex-col gap-3 rounded-xl p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{ex.trade}</h3>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Example</span>
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">TikTok video ad idea · example made by Komendly&apos;s Ozzy</p>
      <p className="text-sm"><span className="font-medium text-foreground/80">First 2 seconds, on screen: </span><span className="italic text-foreground/90">&ldquo;{ex.hook}&rdquo;</span></p>
      <div>
        <p className={eyebrow}>What you film</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">{ex.shots.map((s) => <li key={s}>{s}</li>)}</ol>
      </div>
      <div>
        <p className={eyebrow}>Ad text · {TIKTOK_AD_TEXT_MAX} characters max</p>
        <ul className="mt-2"><CountedLine text={ex.adText} max={TIKTOK_AD_TEXT_MAX} /></ul>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Button</span>
        <span className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium">{ex.button}</span>
      </div>
      <p className="mt-auto text-sm text-muted-foreground"><span className="font-medium text-foreground/80">Why it works: </span>{ex.why}</p>
    </li>
  );
}

/** TikTok ad examples for local service businesses, with ad text counted against TikTok's 100-character limit. */
export function TikTokGuide({ links }: { links: { hook: string; script: string; size: string; plumbersGoogle: string; hvacGoogle: string } }) {
  return (
    <section id="tiktok-examples" className="mx-auto mt-16 max-w-5xl scroll-mt-24 px-4 sm:px-6" aria-labelledby="tiktok-examples-title">
      <h2 id="tiktok-examples-title" className={h2}>TikTok ad examples for local businesses</h2>
      <p className="mt-4 max-w-3xl text-muted-foreground">
        Five video ad ideas for trades and local services, written as examples by Komendly&apos;s Ozzy. They aren&apos;t real companies or customer ads and claim no results. {TOWN} stands in for your town. Each ad text is counted against TikTok&apos;s {TIKTOK_AD_TEXT_MAX}-character limit.
      </p>
      <ul className="mt-8 grid gap-5 md:grid-cols-2">{TIKTOK_EXAMPLES.map((e) => <TikTokCard key={e.trade} ex={e} />)}</ul>
      <div className="mt-14 grid gap-10 md:grid-cols-2">
        <div>
          <h3 className={h3}>What to put in a TikTok ad</h3>
          <Bullets items={TIKTOK_PUT_IN_AD} />
        </div>
        <div>
          <h3 className={h3}>Specs to check before you upload</h3>
          <Bullets items={TIKTOK_SPECS} />
        </div>
      </div>
      <p className="mt-10 text-muted-foreground">
        Komendly doesn&apos;t post or run TikTok ads. To write the opening line and script, use the free <Link href={links.hook} className={link}>hook generator</Link> and <Link href={links.script} className={link}>UGC script generator</Link>, and check sizes in the <Link href={links.size} className={link}>ad size guide</Link>. Film it on your phone and upload it yourself.
      </p>
      <p className="mt-3 text-muted-foreground">
        Need calls from people whose pipe has burst or whose AC has stopped? They are searching, not scrolling: see <Link href={links.plumbersGoogle} className={link}>Google ads for plumbers</Link> and <Link href={links.hvacGoogle} className={link}>Google ads for heating and cooling repair companies</Link>.
      </p>
    </section>
  );
}
