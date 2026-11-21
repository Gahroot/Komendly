import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/ad-examples/parts";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { CHROME_EXTENSION_NAME, CHROME_EXTENSION_PATH, CHROME_EXTENSION_URL } from "@/lib/growth/chrome-extension";
import { absoluteUrl } from "@/lib/site";
import { breadcrumbJsonLd, faqJsonLd, freeToolJsonLd, graph } from "@/lib/seo/jsonld";
import "@/components/studio/studio.css";

// Static route: takes precedence over /tools/[slug] (which only serves FREE_TOOLS slugs).
const TITLE = "Free Chrome extension: remake any Meta Ad Library ad for your business";
const DESCRIPTION = "Komendly: Remake this ad adds a \"Remake for my business\" button to every ad in the Meta Ad Library. One click opens Komendly with that ad and your website filled in. Free.";

export const metadata: Metadata = { title: TITLE, description: DESCRIPTION, alternates: { canonical: CHROME_EXTENSION_PATH }, openGraph: { title: TITLE, description: DESCRIPTION, url: CHROME_EXTENSION_PATH } };

const STEPS = [
  { title: "Add it to Chrome", body: "Open the extension once and type your business website. It's saved in your Chrome settings so you only do it once." },
  { title: "Browse the Ad Library", body: "Look up any business in Meta's public Ad Library. Each ad card gets a \"Remake for my business\" button." },
  { title: "Get your version", body: "Click it and Komendly opens with that ad and your website filled in. Ozzy borrows the idea and style, never the words, logos or photos." },
] as const;

const FAQ = [
  { q: "Is it free?", a: "Yes. The extension is free. Making ads on Komendly starts with a free pack of 3 ads, no card. If you want Komendly to run your ads, the Ozzy Ad Department is $97 the first month, then $197/month, cancel anytime." },
  { q: "Which sites does it run on?", a: "Only the Meta Ad Library (facebook.com/ads/library). It does nothing on any other page, including the rest of Facebook." },
  { q: "Will it copy someone else's ad?", a: "No. Your version keeps the structure and style only. Wording, logos, people and photos come from your own business." },
  { q: "Is it made by Meta?", a: "No. Komendly is not affiliated with, endorsed by or sponsored by Meta." },
] as const;

const PRIVACY = [
  "We collect nothing in the background. The extension has no analytics, no tracking and no account.",
  "When you click \"Remake for my business\", it opens komendly.com with only that ad's public details (its Ad Library link, headline, text, image link and Page name) and the website you saved. The popup's \"Check ads\" shortcut likewise sends only the Facebook Page you pick to our free ad check.",
  "Your website is stored in chrome.storage.sync, Chrome's own settings storage, so it follows your Chrome profile. It is never sent anywhere until you click the button. Clear it any time from the extension popup or by removing the extension.",
  "It reads only the Meta Ad Library pages you open, and only to place the button. It does not read your Facebook account, messages, feed or any other site.",
  "We never sell or share extension data. What happens on komendly.com is covered by our privacy policy.",
] as const;

export default function ChromeExtensionPage() {
  const live = CHROME_EXTENSION_URL !== "";
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <JsonLd data={graph(freeToolJsonLd({ name: CHROME_EXTENSION_NAME, description: DESCRIPTION, path: CHROME_EXTENSION_PATH }), breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }, { name: "Chrome extension", path: CHROME_EXTENSION_PATH }]), faqJsonLd([...FAQ], absoluteUrl(CHROME_EXTENSION_PATH)))} />
      <StudioNav signedIn={false} />
      <main className="px-4 sm:px-6">
        <header className="mx-auto max-w-3xl pt-8 text-center sm:pt-14">
          <div className="flex justify-center"><Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Free tools", href: "/tools" }, { name: "Chrome extension" }]} /></div>
          <h1 className="font-display mt-5 text-balance text-[2.1rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-5xl">Saw a great ad? Remake it for your business in one click</h1>
          <p className="mx-auto mt-5 max-w-2xl text-muted-foreground sm:text-lg">{CHROME_EXTENSION_NAME} is a free Chrome extension. It adds a &quot;Remake for my business&quot; button to every ad in the Meta Ad Library, so you can turn any ad you like into your own.</p>
          <div className="mt-8 flex flex-col items-center gap-2">
            {live ? (
              <a href={CHROME_EXTENSION_URL} rel="noopener" className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--studio-gold)] px-6 font-semibold text-[#2a0f10] transition hover:brightness-105">Add to Chrome, it&apos;s free</a>
            ) : (
              <p className="rounded-xl border border-border px-6 py-3 font-medium">Coming soon to the Chrome Web Store</p>
            )}
            <p className="text-xs text-muted-foreground">Not affiliated with Meta.</p>
          </div>
        </header>
        <section className="mx-auto mt-14 max-w-5xl" aria-labelledby="how-title">
          <h2 id="how-title" className="font-display text-2xl font-medium sm:text-3xl">How it works</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-border p-6">
                <span className="font-mono text-sm text-[var(--studio-gold)]">0{i + 1}</span>
                <h3 className="mt-2 font-display text-xl font-medium">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-muted-foreground">The popup also has a shortcut to the free <Link href="/tools/meta-ad-check" className="text-[var(--studio-gold)] hover:underline">Meta ad check</Link> for any advertiser you&apos;re looking at.</p>
        </section>
        <section id="privacy" className="mx-auto mt-16 max-w-3xl scroll-mt-24" aria-labelledby="privacy-title">
          <h2 id="privacy-title" className="font-display text-2xl font-medium sm:text-3xl">Privacy</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-muted-foreground">{PRIVACY.map((p) => <li key={p}>{p}</li>)}</ul>
          <p className="mt-4 text-sm text-muted-foreground">Permissions: <code>storage</code> (to remember your website) and access to <code>facebook.com/ads/library</code> (to add the button). Questions? See our <Link href="/privacy" className="text-[var(--studio-gold)] hover:underline">privacy policy</Link>.</p>
        </section>
        <section className="mx-auto mt-16 max-w-3xl" aria-labelledby="faq-title">
          <h2 id="faq-title" className="font-display text-2xl font-medium sm:text-3xl">Questions</h2>
          <div className="mt-6 divide-y divide-border rounded-xl border border-border">
            {FAQ.map((f) => (
              <details key={f.q} className="px-5 py-4"><summary className="cursor-pointer list-none font-medium">{f.q}</summary><p className="mt-2 text-sm text-muted-foreground">{f.a}</p></details>
            ))}
          </div>
        </section>
        <section className="mx-auto max-w-3xl py-16 text-center text-sm text-muted-foreground">
          <p>No extension needed to start: paste your website and get a free pack of 3 ads.</p>
          <Link href="/free-ads?utm_source=chrome_ext&utm_medium=acquire&utm_content=tool_page" className="mt-2 inline-block font-medium text-[var(--studio-gold)] hover:underline">Make my free ads</Link>
        </section>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
