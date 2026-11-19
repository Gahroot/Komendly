import type { Metadata } from "next";
import Link from "next/link";
import { CtaButton } from "@/components/ad-examples/parts";
import { Faq, Hero, LINK, Section, Shell } from "@/components/integrations/parts";
import { INTEGRATIONS, INTEGRATION_STATUS, MCP_URL } from "@/lib/integrations";
import { faqJsonLd, graph, jsonLdString } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site";

const TITLE = "Integrations: ChatGPT, Claude, Shopify and AI agents";
const DESCRIPTION = "Use Komendly where you already work: make Facebook and Instagram ads and videos from ChatGPT, Claude, Cursor, the CLI or your Shopify store, on one account.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/integrations" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/integrations" },
};

const FAQ = [
  { q: "Do I need a separate account for each integration?", a: "No. ChatGPT, Claude, Cursor, the CLI and the web app all sign in to the same Komendly account, so your plan, credits, ad packs and videos are shared everywhere." },
  { q: "Which ad platforms does Komendly publish to?", a: "Meta only: Facebook and Instagram. From ChatGPT or Claude you can also hand the finished creatives to your own Meta Ads tool." },
  { q: "Are the ChatGPT and Claude apps in their directories yet?", a: "They have been submitted and are waiting for review. Until they appear, you add Komendly yourself as a custom connector with one URL and a sign-in; it works the same way." },
];

const jsonLd = jsonLdString(graph(faqJsonLd(FAQ, `${SITE_URL}/integrations`)));

export default function IntegrationsHub() {
  return (
    <Shell jsonLd={jsonLd}>
      <Hero
        kicker="Integrations"
        title="Komendly where you already work"
        also="Also called apps, connectors or plugins."
        intro={<p>One account, every place you make ads: chat apps, coding agents, scripts and your store. Komendly makes the Facebook and Instagram ads and the videos; you pick where you ask for them.</p>}
        cta={<CtaButton href="/free-ads">Make my free ad pack</CtaButton>}
      />
      <Section id="list-title" title="Pick your app">
        <ul className="mt-8 grid gap-4 sm:grid-cols-3">
          {INTEGRATIONS.map((i) => (
            <li key={i.slug}>
              <Link href={`/integrations/${i.slug}`} className="studio-frame block h-full rounded-xl p-6 transition hover:brightness-110">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">{i.name}{INTEGRATION_STATUS[i.slug].listed ? "" : i.slug === "shopify" ? " · app in review" : " · custom connector"}</p>
                <h3 className="mt-2 font-medium text-foreground">{i.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{i.description}</p>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link href="/agents" className="studio-frame block rounded-xl p-6 transition hover:brightness-110">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Cursor · Claude Code · CLI</p>
            <h3 className="mt-2 font-medium text-foreground">Ozzy for your AI agent</h3>
            <p className="mt-2 text-sm text-muted-foreground">Add the MCP server <code className="font-mono">{MCP_URL}</code> to Cursor or Claude Code, or script it with <code className="font-mono">npx komendly</code>.</p>
          </Link>
          <Link href="/tools" className="studio-frame block rounded-xl p-6 transition hover:brightness-110">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">No sign-up</p>
            <h3 className="mt-2 font-medium text-foreground">Free ad tools</h3>
            <p className="mt-2 text-sm text-muted-foreground">Small free tools for writing and checking ads, right in the browser.</p>
          </Link>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">Prefer the browser? <Link href="/free-ads" className={LINK}>Paste your website for a free ad pack</Link>.</p>
      </Section>
      <Faq items={FAQ} />
    </Shell>
  );
}
