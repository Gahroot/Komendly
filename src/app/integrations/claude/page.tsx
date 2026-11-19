import type { Metadata } from "next";
import Link from "next/link";
import { CtaButton } from "@/components/ad-examples/parts";
import { Faq, FinalCta, Hero, LINK, Prompts, Section, Shell, ToolList } from "@/components/integrations/parts";
import { INTEGRATION_STATUS, MCP_URL, statusLine } from "@/lib/integrations";
import { faqJsonLd, graph, jsonLdString } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site";

const TITLE = "Komendly connector for Claude: MCP for ads and video";
const DESCRIPTION = "Add Komendly's remote MCP server to claude.ai, Claude Desktop or Claude Code and let Claude make ad packs, video ads, remixes and launch videos for your brand.";
const STATUS = INTEGRATION_STATUS.claude;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/integrations/claude" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/integrations/claude" },
};

const SETUPS = [
  { label: "claude.ai and Claude Desktop", steps: ["Open Settings > Connectors > Add custom connector.", "Name it Komendly and paste the URL below.", "Click Connect, sign in to Komendly and click Allow.", "In a chat, open the tools menu and make sure Komendly is on."], code: MCP_URL },
  { label: "Claude Code", steps: ["Run the command below in your project.", "Type /mcp, pick ozzy and sign in in the browser.", "Ask in plain words; Claude Code can save the files into your repo."], code: `claude mcp add --transport http ozzy ${MCP_URL}` },
];

const PROMPTS = [
  "Read our landing page at https://example.com, then use Komendly to make an animated ad pack and summarise each ad's angle in a table.",
  "Make a launch video for what we just shipped. Here's the changelog: ... Use the public site https://app.example.com.",
  "Upload ./assets/hero.mp4 to Ozzy and cut a 20 second 1:1 ad with captions, then download it to ./ads.",
  "Remix this TikTok ad for our brand: https://www.tiktok.com/@... and give me the Meta headline and primary text for it.",
  "Turn on Ozzy Autopilot with this week's focus: 'free shipping until Sunday'.",
  "Give me a campaign kit for my last ad pack so my Meta Ads tool can create a paused campaign.",
];

const FAQ = [
  { q: "Is there a Claude MCP for making ads?", a: "Yes. Komendly runs a hosted remote MCP server at " + MCP_URL + ". Add it as a connector and Claude can make ad packs, video ads and launch videos for you." },
  { q: "Is Komendly in the Claude connector directory?", a: STATUS.listed ? "Yes, you can add it from the Claude connector directory." : "It has been submitted and is waiting for review. Until it appears, add it as a custom connector with the URL on this page; nothing else changes." },
  { q: "Do I need an API key?", a: "Not for claude.ai, Claude Desktop or Claude Code: you sign in with OAuth and click Allow. API keys are only for the komendly CLI and scripts." },
  { q: "Can Claude publish the ads to Facebook?", a: "Komendly makes the creatives and returns a campaign kit (media links, copy, button, placements). Publishing goes through your own Meta Ads tool or Ads Manager; Komendly only works with Meta, not other ad networks." },
  { q: "What about local or staging apps?", a: "The launch video tool records public sites only. For localhost or anything behind a login, Claude Code can run npx komendly launch, which records on your machine." },
];

const jsonLd = jsonLdString(graph(faqJsonLd(FAQ, `${SITE_URL}/integrations/claude`)));

export default function ClaudeIntegration() {
  return (
    <Shell jsonLd={jsonLd}>
      <Hero
        kicker="Remote MCP server · OAuth"
        title="Komendly connector for Claude"
        also="For claude.ai, Claude Desktop and Claude Code. Also searched as: Claude MCP for ads, Claude marketing connector."
        intro={<p>Claude is good at deciding what to say. Komendly gives it hands for the visual part: real ad creatives and rendered videos, made on our servers and returned as links Claude can show, compare or save. {statusLine("claude")}</p>}
        cta={STATUS.listed && STATUS.directoryUrl ? <CtaButton href={STATUS.directoryUrl}>Add Komendly to Claude</CtaButton> : <CtaButton href="#setup-title">Add the connector</CtaButton>}
      />
      <Section id="setup-title" title="Setup">
        {STATUS.listed && STATUS.directoryUrl && <p className="mt-4 text-muted-foreground">Fastest: <a href={STATUS.directoryUrl} className={LINK}>install it from the Claude directory</a>. The manual steps still work:</p>}
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {SETUPS.map((s) => (
            <div key={s.label} className="studio-frame rounded-xl p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">{s.label}</p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">{s.steps.map((x) => <li key={x}>{x}</li>)}</ol>
              <pre className="mt-3 overflow-x-auto whitespace-pre rounded-md bg-black/40 p-3 font-mono text-xs text-foreground"><code>{s.code}</code></pre>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">You can see and disconnect every connected app at <Link href="/dashboard/api" className={LINK}>Dashboard → API</Link>. Cursor and the CLI are covered on <Link href="/agents" className={LINK}>Ozzy for AI agents</Link>.</p>
      </Section>
      <Section id="tools-title" title="Every tool Claude gets">
        <p className="mt-4 max-w-2xl text-muted-foreground">The full list the server registers. Long jobs return quickly and Claude polls the status tools until the ads or video are ready.</p>
        <ToolList />
      </Section>
      <Section id="prompts-title" title="Prompts that work well">
        <Prompts prompts={PROMPTS} />
      </Section>
      <Faq items={FAQ} />
      <FinalCta title="Give Claude a creative team." line="A new account starts with a free ad pack and a free Ozzy Studio video." cta={<CtaButton href="/register">Create your free account</CtaButton>} />
    </Shell>
  );
}
