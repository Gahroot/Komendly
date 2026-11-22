import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Cards, Faq, FinalCta, Hero, LINK, Section, Shell, Steps } from "@/components/integrations/parts";
import { faqJsonLd, graph, jsonLdString } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site";

const TITLE = "Facebook ads for Jobber businesses";
const DESCRIPTION = "Connect Jobber to Komendly: get a free pack of Facebook and Instagram ads made from your website, then fresh ad ideas from the jobs you finish. For roofers, HVAC, plumbers and home services.";
const CONNECT = "/api/integrations/jobber/authorize";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/integrations/jobber" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/integrations/jobber" },
};

const APP_DOES = [
  { title: "Free ad pack on connect", line: "Connect Jobber, paste your website, and Ozzy makes 3 ready-to-run Facebook and Instagram ads in your brand's look, with headlines and ad copy." },
  { title: "Finished jobs become ad ideas", line: "When you close a job or complete a visit in Jobber, Komendly reads the service and the city (for example \"roof replacement in Austin, TX\") and uses it to steer your next weekly ads." },
  { title: "Read-only, no client details", line: "The app only reads your account name and the jobs you finish. It never changes anything in Jobber and doesn't keep client names, phone numbers or street addresses." },
  { title: "Disconnect any time", line: "Disconnect from Jobber's App Marketplace and Komendly deletes the access it was given straight away." },
];

const FAQ = [
  { q: "What does the Komendly Jobber app cost?", a: "Connecting is free and your first 10 ads are free. Ozzy Ad Department, with fresh ads every week, is $97 for the first month and $197 a month after that." },
  { q: "Does it read my reviews?", a: "Jobber's API doesn't share reviews with apps today, so Komendly uses the jobs you finish. Reviews on your own website are read when Ozzy makes your ads from it." },
  { q: "Which ad platforms does it work with?", a: "Meta only: Facebook and Instagram. You can download the ads or publish them from Komendly." },
  { q: "Will it change anything in Jobber?", a: "No. The app has read-only access and never creates or edits clients, jobs, quotes or invoices." },
  { q: "I use Housecall Pro. Is there an app?", a: "Not yet: Housecall Pro only opens its API to approved partners. Paste your website into the free ad pack instead; it makes the same ads." },
];

const NOTICES: Record<string, string> = {
  unavailable: "Connecting Jobber is paused for a little while. Please try again later, or paste your website for a free ad pack.",
  denied: "Jobber wasn't connected. You can try again whenever you like.",
  error: "That didn't work. Please connect Jobber again.",
};

/** Plain link (not next/link): prefetching the authorize route would start an OAuth flow. */
function ConnectButton({ children }: { children: React.ReactNode }) {
  return (
    <a href={CONNECT} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--studio-gold)] px-6 text-base font-semibold text-[#2a0f10] shadow-[0_0_24px_#ffcf4a55] transition hover:brightness-105">
      {children} <ArrowRight className="size-4" aria-hidden />
    </a>
  );
}

const jsonLd = jsonLdString(graph(faqJsonLd(FAQ, `${SITE_URL}/integrations/jobber`)));

export default async function JobberIntegration({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const notice = sp.unavailable ? NOTICES.unavailable : sp.denied ? NOTICES.denied : sp.error ? NOTICES.error : null;
  return (
    <Shell jsonLd={jsonLd}>
      <Hero
        kicker="Jobber app"
        title="Facebook ads for your Jobber business"
        also="For roofers, HVAC, plumbers, cleaners, landscapers and every home-service business that runs on Jobber."
        intro={<p>You already do great work. Komendly turns your website and the jobs you finish in Jobber into Facebook and Instagram ads that bring in the next customer. Your first 10 ads are free.</p>}
        cta={<ConnectButton>Connect Jobber, get 10 free ads</ConnectButton>}
      />
      {notice ? <p role="status" className="mx-auto max-w-3xl px-4 text-sm text-muted-foreground sm:px-6">{notice}</p> : null}
      <Section id="how-title" title="How it works">
        <Steps steps={[
          { title: "Connect Jobber", body: <p>Click Connect here or in Jobber&apos;s App Marketplace and allow read-only access.</p> },
          { title: "Paste your website", body: <p>Create your Komendly account and paste your business website. Ozzy reads your services, reviews and brand.</p> },
          { title: "Get your ads, then fresh ones", body: <p>Your free ads are ready in minutes. Each job you close in Jobber becomes an idea for your next weekly ads.</p> },
        ]} />
      </Section>
      <Section id="app-title" title="What the Komendly app for Jobber does">
        <Cards items={APP_DOES} />
        <p className="mt-6 text-sm text-muted-foreground">See finished ads for your trade in <Link href="/ad-examples" className={LINK}>ad examples</Link>, or skip the app and <Link href="/free-ads?utm_source=jobber" className={LINK}>paste your website for a free ad pack</Link>.</p>
      </Section>
      <Faq items={FAQ} />
      <FinalCta title="Your finished jobs, as ads." line="First 10 ads free, no card." cta={<ConnectButton>Connect Jobber</ConnectButton>} />
    </Shell>
  );
}
