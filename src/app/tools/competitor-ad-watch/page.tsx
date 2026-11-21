import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/ad-examples/parts";
import { AdWatchOptin } from "@/components/growth/ad-watch-optin";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { AD_WATCH_OFFER } from "@/lib/growth/ad-watch";
import { adWatchEnabled } from "@/lib/growth/ad-watch-server";
import { absoluteUrl } from "@/lib/site";
import { breadcrumbJsonLd, faqJsonLd, freeToolJsonLd, graph } from "@/lib/seo/jsonld";
import "@/components/studio/studio.css";

export const revalidate = 300;

const PATH = "/tools/competitor-ad-watch";
const TITLE = "Competitor ad watch: your rivals' new Facebook ads, every Monday";
const DESCRIPTION = "Free weekly email from Komendly: the new Facebook and Instagram ads up to 5 local competitors launched, each with a one-tap \"Make my version\".";

export const metadata: Metadata = { title: TITLE, description: DESCRIPTION, alternates: { canonical: PATH }, openGraph: { title: TITLE, description: DESCRIPTION, url: PATH } };

const STEPS = [
  { title: "Add your rivals", body: "Your trade, your city and up to 5 competitors' Facebook Pages. Confirm by email." },
  { title: "Monday email", body: "Komendly checks Meta's public Ad Library and emails you up to 3 ads they started running that week." },
  { title: "Make your version", body: "Tap \"Make my version\" and Ozzy rebuilds the idea for your brand. Nothing is copied word for word." },
] as const;

const FAQ = [
  { q: "Where do the ads come from?", a: "From Meta's public Ad Library, which shows every active ad a Facebook Page runs. We only look at the Pages you add." },
  { q: "What if my competitors launch nothing new?", a: "Then there's no email that week. You only hear from us when there's something new." },
  { q: "Does it cost anything?", a: "No. The weekly email is free. If you want Komendly to make and run ads for you, that's the Ozzy Ad Department, and it's optional." },
  { q: "How do I stop it?", a: "Every email has a one-click unsubscribe link at the bottom." },
] as const;

export default async function CompetitorAdWatchPage() {
  const on = await adWatchEnabled();
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <JsonLd data={graph(freeToolJsonLd({ name: "Competitor ad watch", description: DESCRIPTION, path: PATH }), breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }, { name: "Competitor ad watch", path: PATH }]), faqJsonLd([...FAQ], absoluteUrl(PATH)))} />
      <StudioNav signedIn={false} />
      <main className="px-4 sm:px-6">
        <header className="mx-auto max-w-3xl pt-8 text-center sm:pt-14">
          <div className="flex justify-center"><Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Free tools", href: "/tools" }, { name: "Competitor ad watch" }]} /></div>
          <h1 className="font-display mt-5 text-balance text-[2.1rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-5xl">See your competitors&apos; new ads every Monday</h1>
          <p className="mx-auto mt-5 max-w-2xl text-muted-foreground sm:text-lg">A free weekly email from Komendly with the new Facebook and Instagram ads your local rivals started running, and a one-tap way to make your own version.</p>
        </header>
        <section className="mx-auto mt-10 max-w-2xl" aria-label="Sign up for Competitor ad watch">
          {on ? <AdWatchOptin source="standalone" title="Start your free Competitor ad watch" /> : <p className="rounded-xl border border-border p-6 text-center text-muted-foreground">Competitor ad watch is taking a short break. Back soon!</p>}
        </section>
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
          <p>{AD_WATCH_OFFER}</p>
          <Link href="/ads/pricing?utm_source=ad_watch&utm_medium=acquire&utm_content=tool_page" className="mt-2 inline-block font-medium text-[var(--studio-gold)] hover:underline">See the Ad Department</Link>
        </section>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
