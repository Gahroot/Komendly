import type { Metadata } from "next";
import Link from "next/link";
import { Cards, Faq, Hero, LINK, Section, Shell } from "@/components/integrations/parts";
import { CtaButton } from "@/components/ad-examples/parts";
import { embedIframeSnippet, embedSnippet } from "@/lib/growth/embed";
import { faqJsonLd, graph, jsonLdString } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site";

const TITLE = "Embed a \"Make ads from your website\" box on any site";
const DESCRIPTION = "Add Komendly's free ad-pack box to your agency or client site with one script tag or an iframe. No API key, no data collected.";
export const metadata: Metadata = { title: TITLE, description: DESCRIPTION, alternates: { canonical: "/developers/embed" }, openGraph: { title: TITLE, description: DESCRIPTION, url: "/developers/embed" } };

const FAQ = [
  { q: "What does the widget collect?", a: "Nothing. It is a plain form: the visitor types a website address and a new tab opens komendly.com/free-ads with it filled in. The only thing added is a UTM tag with your partner tag." },
  { q: "Do I need an API key or approval?", a: "No. The partner tag is any short lowercase label (letters, numbers, dashes, up to 40 characters). Never put a client's name or email in it, since it is visible in the page URL." },
  { q: "Is it rate-limited?", a: "The widget makes no API calls, so there is nothing to abuse. Sign-up and the free pack have their own limits on komendly.com." },
  { q: "Do I earn anything from it?", a: "The tag is for your own attribution. Commission only comes from the separate, application-based partner program, which uses your partner referral link." },
  { q: "Can I restyle it?", a: "Not yet. You can set the width of the container; the box is fixed at 520px max." },
];
const jsonLd = jsonLdString(graph(faqJsonLd(FAQ, `${SITE_URL}/developers/embed`)));
const pre = "mt-3 overflow-x-auto rounded-xl border border-border bg-[oklch(0.2_0.07_295/0.5)] p-4 text-xs";

export default function EmbedDocs() {
  return (
    <Shell jsonLd={jsonLd}>
      <Hero kicker="Developers" title="Embed “Make ads from your website”" intro={<p>For web designers and agencies: give your site, or a client&apos;s, a box that turns any visitor&apos;s website into a free Facebook and Instagram ad pack.</p>} cta={<CtaButton href="/embed/ads?p=docs">See the widget</CtaButton>} />
      <Section id="script-title" title="Script tag" narrow>
        <p className="mt-4 text-sm text-muted-foreground">Paste where the box should appear. Replace <code>your-agency</code> with your own tag.</p>
        <pre className={pre}><code>{embedSnippet(SITE_URL)}</code></pre>
      </Section>
      <Section id="iframe-title" title="Or a plain iframe" narrow>
        <pre className={pre}><code>{embedIframeSnippet(SITE_URL)}</code></pre>
      </Section>
      <Section id="safe-title" title="Safe by design">
        <Cards items={[
          { title: "No data collected", line: "A GET form that opens komendly.com in a new tab. No cookies are read, no email or client data passes through." },
          { title: "Tag is validated", line: "Only lowercase letters, numbers, dashes and underscores are accepted; anything else becomes \"embed\"." },
          { title: "Not indexed", line: "The iframe page is noindex so it never competes with your own site." },
          { title: "Want commission?", line: "Apply to the partner program separately." },
        ]} />
        <p className="mt-6 text-sm"><Link href="/partners" className={LINK}>Partner program</Link> · <Link href="/for/web-designers" className={LINK}>For web designers</Link> · <Link href="/developers/api" className={LINK}>API docs</Link></p>
      </Section>
      <Faq items={FAQ} />
    </Shell>
  );
}
