import type { Metadata } from "next";
import { CtaButton } from "@/components/ad-examples/parts";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioPose } from "@/components/studio/studio-pose";
import { StudioRoot } from "@/components/studio/studio-spell";
import { faqJsonLd, graph, jsonLdString } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site";
import "@/components/studio/studio.css";

// Static, session-independent marketing page (cached publicly via next.config.ts headers()).
const DESCRIPTION =
  "Let Claude, Cursor, ChatGPT or any AI agent make videos and ad packs with Ozzy. Add the Ozzy MCP server and sign in, or use the komendly CLI, on your normal plan and credits.";

export const metadata: Metadata = {
  title: "Ozzy for your AI agent",
  description: DESCRIPTION,
  alternates: { canonical: "/agents" },
  openGraph: { title: "Ozzy for your AI agent", description: DESCRIPTION, url: "/agents" },
};

const CAN_DO = [
  { title: "Studio videos and animations", line: "Your agent describes the video, Ozzy builds it, then the agent asks for edits: \"make it 9:16\", \"add captions\", \"slower intro\"." },
  { title: "Your own footage", line: "Hand it a clip, a product photo or a voiceover. The agent uploads it and Ozzy cuts, captions and animates around it." },
  { title: "Ad packs from a website", line: "Give it a URL and get a pack of static ads plus animated ads, written from the brand's own site and reviews." },
  { title: "Status and downloads", line: "The agent checks progress, waits for renders and downloads the finished MP4s, PNGs or the whole pack as a ZIP." },
];

const MCP_URL = "https://www.komendly.com/api/mcp";

const SNIPPETS = [
  { label: "Claude (claude.ai and Claude Desktop)", hint: "Settings > Connectors > Add custom connector, paste the URL, then sign in.", code: MCP_URL },
  { label: "ChatGPT", hint: "Settings > Apps & Connectors > Create (developer mode), paste the URL, choose OAuth, then sign in.", code: MCP_URL },
  { label: "Cursor (mcp.json)", hint: "Add this, then click Connect next to ozzy and sign in.", code: '{\n  "mcpServers": {\n    "ozzy": { "url": "https://www.komendly.com/api/mcp" }\n  }\n}' },
  { label: "Claude Code", hint: "Run this, then type /mcp and pick ozzy to sign in.", code: `claude mcp add --transport http ozzy ${MCP_URL}` },
  { label: "Any agent or script (CLI)", hint: "Uses a personal API key from Dashboard > API.", code: 'npx komendly login\nnpx komendly video "15s launch teaser for my coffee app" --wait --out ./videos' },
];

const PROMPTS = [
  "Use Ozzy to make a 15 second 9:16 video ad for my bakery's new sourdough subscription, then download it to ./ads.",
  "Upload ./footage/demo.mp4 to Ozzy and turn it into a 30 second product demo with captions and a call to action at the end.",
  "Make an animated ad pack for https://example.com with Ozzy, wait until it's done and save every ad into ./ad-pack.",
  "Check my Ozzy account: which plan am I on and how many credits are left?",
  "Open my last Ozzy video and ask for a square 1:1 version with bigger captions.",
];

const FAQ = [
  { q: "What does it cost to use Ozzy from an agent?", a: "The same as the web app. Your agent works on your account, with your plan and your credits. Nothing extra to buy and no separate API pricing." },
  { q: "Do the free video and free ad pack work from an agent?", a: "Yes. A new account gets the same free Ozzy Studio video and free ad pack whether you start them in the browser or from Claude, Cursor, ChatGPT or the CLI." },
  { q: "Is it unlimited on the Ad Department and Agency plans?", a: "Yes. On Ad Department and Agency, Studio videos and ad packs are unlimited from an agent too, with the same fair-use rule as the app: one job at a time on Ad Department (one business), three at a time on Agency (up to 10 brands)." },
  { q: "What happens when I run out of credits?", a: "Ozzy tells your agent in plain words and includes a link to the pricing page, so the agent can pass it on to you. Nothing is charged without you." },
  { q: "Is it safe to connect?", a: "You sign in on komendly.com and approve each app yourself; the app never sees your password. You can see every connected app and CLI key at Dashboard > API and disconnect any of them at once." },
];

const jsonLd = graph(faqJsonLd(FAQ, `${SITE_URL}/agents`));

export default function AgentsPage() {
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <StudioNav signedIn={false} />
      <main>
        <section className="mx-auto max-w-3xl px-4 pt-8 text-center sm:px-6 sm:pt-14">
          <div className="flex justify-center"><StudioPose form="developer" expression="happy" size={96} /></div>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">MCP server · CLI</p>
          <h1 className="font-display mt-3 text-balance text-[2.3rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-6xl">Ozzy for your AI agent</h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
            Let Claude, Cursor, ChatGPT or your own scripts make videos and ad packs with Ozzy. Same account, same plan, same credits: your agent just does the clicking.
          </p>
          <div className="mt-8 flex justify-center"><CtaButton href="/register">Create your free account</CtaButton></div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20" aria-labelledby="can-title">
          <h2 id="can-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-5xl">What your agent can do</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {CAN_DO.map((c) => (
              <li key={c.title} className="studio-frame rounded-xl p-5">
                <h3 className="font-medium text-foreground">{c.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{c.line}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="setup-title">
          <h2 id="setup-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-5xl">Set up in 3 steps</h2>
          <ol className="mt-8 space-y-8">
            <li>
              <h3 className="font-medium"><span className="text-[var(--studio-gold)]">1.</span> Add Ozzy to your app</h3>
              <p className="mt-2 text-sm text-muted-foreground">Add a custom connector (or MCP server) with this URL: <code className="font-mono text-foreground">{MCP_URL}</code></p>
            </li>
            <li>
              <h3 className="font-medium"><span className="text-[var(--studio-gold)]">2.</span> Sign in and click Allow</h3>
              <p className="mt-2 text-sm text-muted-foreground">Your app opens Komendly. Sign in (or create a free account) and allow access. No key to copy. For scripts, use the CLI with a key from <a href="/dashboard/api" className="text-[var(--studio-gold)] underline-offset-4 hover:underline">Dashboard → API</a>.</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {SNIPPETS.map((s) => (
                  <div key={s.label} className="studio-frame rounded-xl p-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">{s.label}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{s.hint}</p>
                    <pre className="mt-3 overflow-x-auto whitespace-pre rounded-md bg-black/40 p-3 font-mono text-xs text-foreground"><code>{s.code}</code></pre>
                  </div>
                ))}
              </div>
            </li>
            <li>
              <h3 className="font-medium"><span className="text-[var(--studio-gold)]">3.</span> Ask for what you want</h3>
              <p className="mt-2 text-sm text-muted-foreground">Talk to your agent like you&apos;d talk to Ozzy. Paste one of these to start:</p>
              <ul className="mt-4 space-y-3">
                {PROMPTS.map((p) => (
                  <li key={p} className="rounded-xl border border-border bg-[oklch(0.2_0.07_295/0.5)] px-4 py-3 text-sm text-foreground">“{p}”</li>
                ))}
              </ul>
            </li>
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="launch-title">
          <h2 id="launch-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-5xl">Launch videos for builders</h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">Just shipped something? Ozzy opens your real product, records it (cursor on your main button, smooth scrolls, key pages) and cuts a 20–40 second launch video with captions and your link. Local or staging app? The CLI records it on your machine.</p>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="studio-frame rounded-xl p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Ask Claude Code</p>
              <p className="mt-3 rounded-md bg-black/40 p-3 text-sm text-foreground">“make a launch video for what we just shipped”</p>
            </div>
            <div className="studio-frame rounded-xl p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Or run it yourself</p>
              <pre className="mt-3 overflow-x-auto whitespace-pre rounded-md bg-black/40 p-3 font-mono text-xs text-foreground"><code>{'npx komendly launch https://yourapp.com --notes "..."'}</code></pre>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="campaign-title">
          <h2 id="campaign-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-5xl">Run a whole campaign from ChatGPT or Claude</h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">Ozzy makes the creatives; your Meta Ads MCP puts them live. Ozzy hands over every video and ad with its link, headline, text, button and placement, so nothing gets copied by hand. You still approve the budget.</p>
          <ol className="mt-8 grid gap-4 lg:grid-cols-3">
            <li className="studio-frame rounded-xl p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">1. Connect Ozzy</p>
              <p className="mt-2 text-sm text-muted-foreground">Add a connector with this URL and sign in:</p>
              <pre className="mt-3 overflow-x-auto whitespace-pre rounded-md bg-black/40 p-3 font-mono text-xs text-foreground"><code>{MCP_URL}</code></pre>
            </li>
            <li className="studio-frame rounded-xl p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">2. Connect your Meta Ads MCP</p>
              <p className="mt-2 text-sm text-muted-foreground">Add your Meta Ads MCP in the same app and sign in to your ad account.</p>
            </li>
            <li className="studio-frame rounded-xl p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">3. Ask for the campaign</p>
              <p className="mt-3 rounded-md bg-black/40 p-3 text-sm text-foreground">“Remix this competitor ad for us: [link]. Make a launch video of [your site]. Make an ad pack from our website and turn on Ozzy Autopilot. Then put everything in a paused Meta campaign with my Meta Ads tool so I can check it.”</p>
            </li>
          </ol>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6" aria-labelledby="faq-title">
          <h2 id="faq-title" className="font-display text-3xl font-medium tracking-[-0.02em]">Questions</h2>
          <div className="mt-6 divide-y divide-border rounded-2xl border border-border bg-[oklch(0.2_0.07_295/0.5)]">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span aria-hidden className="text-[var(--studio-gold)] transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-16 pt-8 text-center sm:px-6" aria-labelledby="final-title">
          <h2 id="final-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Give your agent a creative team.</h2>
          <p className="mt-3 text-muted-foreground">Start free: one Studio video and one ad pack, no card required.</p>
          <div className="mt-6 flex justify-center"><CtaButton href="/register">Sign up free</CtaButton></div>
        </section>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
