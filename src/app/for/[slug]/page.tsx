import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CtaButton } from "@/components/ad-examples/parts";
import { Cards, Faq, FinalCta, Hero, LINK, Section, Shell, Steps } from "@/components/integrations/parts";
import { AUDIENCES, audienceCtaHref, audiencePath, getAudience } from "@/lib/growth/audiences";
import { faqJsonLd, graph, jsonLdString } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site";

// Static, publicly cacheable audience pages; one data file (src/lib/growth/audiences.ts) drives all of them.
export const dynamicParams = false;
export function generateStaticParams() {
  return AUDIENCES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = getAudience((await params).slug);
  if (!a) return {};
  return { title: a.title, description: a.description, alternates: { canonical: audiencePath(a.slug) }, openGraph: { title: a.title, description: a.description, url: audiencePath(a.slug) } };
}

export default async function AudiencePage({ params }: { params: Promise<{ slug: string }> }) {
  const a = getAudience((await params).slug);
  if (!a) notFound();
  const jsonLd = jsonLdString(graph(faqJsonLd(a.faq, `${SITE_URL}${audiencePath(a.slug)}`)));
  return (
    <Shell jsonLd={jsonLd}>
      <Hero kicker={`For ${a.name.toLowerCase()}`} title={a.headline} intro={<p>{a.intro}</p>} cta={<CtaButton href={audienceCtaHref(a.slug, "hero")}>Make a free ad pack</CtaButton>} />
      <Section id="uses-title" title="What you can do with it"><Cards items={a.uses} /></Section>
      <Section id="steps-title" title="Try it in three steps" narrow><Steps steps={a.steps.map((s) => ({ title: s.title, body: <p>{s.line}</p> }))} /></Section>
      <Faq items={a.faq} />
      <FinalCta
        title="See it on a real website"
        line="Free to try. Komendly makes Facebook and Instagram ads only, and can't promise leads or sales."
        cta={
          <div className="flex flex-col items-center gap-3">
            <CtaButton href={audienceCtaHref(a.slug, "end")}>Make a free ad pack</CtaButton>
            <p className="text-sm text-muted-foreground">
              <Link href={audienceCtaHref(a.slug, "partner", "/partners/apply")} className={LINK}>Partner program</Link> · <Link href="/developers/embed" className={LINK}>Embed the widget</Link>
            </p>
          </div>
        }
      />
    </Shell>
  );
}
