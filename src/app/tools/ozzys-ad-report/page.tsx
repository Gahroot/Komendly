import type { Metadata } from "next";
import { NewsletterOptin } from "@/components/growth/newsletter-optin";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { newsletterEnabled } from "@/lib/growth/newsletter-server";
import "@/components/studio/studio.css";

export const revalidate = 300;
const PATH = "/tools/ozzys-ad-report";
const TITLE = "Ozzy's Ad Report: one real ad number, one idea, one tip, every Thursday";
const DESCRIPTION = "A free weekly email from Komendly for local businesses: one number from our own Facebook Ad Library data, one ad idea and one tip. Unsubscribe in one click.";
export async function generateMetadata(): Promise<Metadata> {
  // Thin "opens soon" page stays out of the index until the flag is on.
  return { title: TITLE, description: DESCRIPTION, alternates: { canonical: PATH }, openGraph: { title: TITLE, description: DESCRIPTION, url: PATH }, robots: (await newsletterEnabled()) ? undefined : { index: false, follow: true } };
}

export default async function AdReportPage() {
  const on = await newsletterEnabled();
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <StudioNav signedIn={false} />
      <main className="px-4 py-14 sm:px-6">
        <header className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-balance text-[2.1rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-5xl">Ozzy&apos;s Ad Report</h1>
          <p className="mx-auto mt-5 max-w-2xl text-muted-foreground sm:text-lg">Once a week, 2 minutes: one real number from our Facebook Ad Library data (with its source and date), one ad idea you can use, and one tip. Written by Ozzy, Komendly&apos;s AI.</p>
        </header>
        <section className="mx-auto mt-10 max-w-xl" aria-label="Sign up for Ozzy's Ad Report">
          {on ? <NewsletterOptin source="standalone" /> : <p className="rounded-xl border border-border p-6 text-center text-muted-foreground">The Ad Report opens soon. Check back shortly.</p>}
        </section>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
