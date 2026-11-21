import type { Metadata } from "next";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { FREE_PACK_LINE, UNLOCK_LINE } from "@/lib/ads/public-offer";
import "@/components/studio/studio.css";

// Static, session-independent docs page (cached publicly via next.config.ts headers()). Documents the REST endpoints
// the Zapier app (packages/komendly-zapier) calls; shapes follow the route handlers and src/lib/zapier/format.ts.
const DESCRIPTION =
  "Komendly REST API reference: authenticate with a personal kmd_ API key, start an Ad Pack from a website, list packs, and fetch ready ads with 7-day image links.";

export const metadata: Metadata = {
  title: "API documentation",
  description: DESCRIPTION,
  alternates: { canonical: "/developers/api" },
  openGraph: { title: "Komendly API documentation", description: DESCRIPTION, url: "/developers/api" },
};

const BASE = "https://www.komendly.com";
const link = "text-[var(--studio-gold)] underline-offset-4 hover:underline";
const IMG = "https://komendly-ads.s3.amazonaws.com/ads/cmrun0sample/ad-01-4x5.png?X-Amz-Expires=604800&X-Amz-Signature=...";

const AD_JSON = `{
  "id": "cmad0sample1",
  "ad_id": "cmad0sample1",
  "run_id": "cmrun0sample",
  "website": "https://acme-hvac.example",
  "kind": "static",
  "status": "ready",
  "headline": "AC out? Fixed today.",
  "primary_text": "Same-day AC repair. Upfront prices, no overtime fees. Book in 60 seconds.",
  "cta": "Book now",
  "cta_type": "BOOK_NOW",
  "angle": "No cooling on a hot day",
  "awareness": "problem_aware",
  "landing_url": "https://acme-hvac.example/book",
  "image_url": "${IMG}",
  "video_url": null,
  "image_urls": ["${IMG}"],
  "assets": [
    { "asset_id": "cmasset0feed", "ratio": "4:5", "mime": "image/png", "width": 1080, "height": 1350,
      "url": "${IMG}", "placements": ["feed"] }
  ],
  "links_expire_at": "2026-11-28T10:05:00.000Z",
  "view_url": "https://www.komendly.com/ads/runs/cmrun0sample",
  "upgrade_url": "https://www.komendly.com/pricing?utm_source=zapier&utm_medium=integration",
  "created_at": "2026-11-21T10:05:00.000Z"
}`;

const indent = (s: string, n: number) => s.split("\n").map((l, i) => (i ? " ".repeat(n) + l : l)).join("\n");

interface Endpoint {
  id: string;
  method: "GET" | "POST";
  path: string;
  summary: string;
  params?: { name: string; where: string; desc: string }[];
  notes?: string[];
  curl: string;
  response: string;
  status: string;
}

const ENDPOINTS: Endpoint[] = [
  {
    id: "me",
    method: "GET",
    path: "/api/ads/me",
    summary: "Your account: email, plan and credit balance. Use it to check that a key works (Zapier's connection test calls it).",
    curl: `curl ${BASE}/api/ads/me \\\n  -H "Authorization: Bearer kmd_YOUR_KEY"`,
    status: "200 OK",
    response: `{
  "id": "cmws0sample",
  "name": "Jordan's workspace",
  "plan": "trial",
  "isPaid": false,
  "trialAvailable": true,
  "balance": 0,
  "emailVerified": true,
  "email": "jordan@acme-hvac.example",
  "trialStatic": 10,
  "expiring": [],
  "unlimitedUntil": null
}`,
    notes: [
      "balance is your credit balance. expiring lists referral credits that will expire ({ credits, expiresAt }).",
      "trialAvailable is true while the free Ad Pack is still unused. unlimitedUntil is set while an unlimited week pass runs.",
    ],
  },
  {
    id: "start-run",
    method: "POST",
    path: "/api/ads/runs",
    summary: "Start an Ad Pack: Ozzy reads the website and makes a pack of Meta ads. It takes a few minutes; poll the pack or the ready ads to get them.",
    params: [
      { name: "url", where: "body, required", desc: "The business website. 3 to 2048 characters. Must be a public site." },
      { name: "goal", where: "body", desc: "One of auto, leads, sales, traffic, awareness, app_installs. Default auto (Ozzy picks)." },
      { name: "count", where: "body", desc: "Number of static ads, 1 to 50. Default 10." },
      { name: "ratios", where: "body", desc: "1 to 3 of \"4:5\", \"1:1\", \"9:16\". Default [\"4:5\"]." },
      { name: "awareness", where: "body", desc: "1 to 5 of unaware, problem_aware, solution_aware, product_aware, most_aware. Default problem_aware and solution_aware." },
      { name: "motion", where: "body", desc: "true adds one animated ad." },
      { name: "seed", where: "body", desc: "Optional idea to build the ads around: { angle (required, max 240), hook, headline, style, origin }. Zapier sends the user's offer as angle and hook with origin \"hook_library\"." },
      { name: "brandProfileId", where: "body", desc: "Optional. Reuse a saved brand instead of reading the site again." },
      { name: "reextract", where: "body", desc: "Optional. true reads the website again even if the brand is saved." },
    ],
    notes: [
      "The free pack ignores count, ratios, awareness and motion: it uses the free-pack settings.",
      "If your free pack is still being made, you get that pack back with resumed: true and status 200 instead of a new one.",
    ],
    curl: `curl -X POST ${BASE}/api/ads/runs \\\n  -H "Authorization: Bearer kmd_YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"url":"https://acme-hvac.example","goal":"leads","motion":true,\n       "seed":{"angle":"$49 AC tune-up this week","hook":"$49 AC tune-up this week","origin":"hook_library"}}'`,
    status: "201 Created (200 when resumed)",
    response: `{
  "runId": "cmrun0sample",
  "resumed": false
}`,
  },
  {
    id: "list-runs",
    method: "GET",
    path: "/api/ads/runs",
    summary: "Your 20 newest Ad Packs, newest first. Zapier uses it for the \"New Ad Pack\" trigger and to find a pack by website.",
    curl: `curl ${BASE}/api/ads/runs \\\n  -H "Authorization: Bearer kmd_YOUR_KEY"`,
    status: "200 OK",
    response: `{
  "runs": [
    {
      "id": "cmrun0sample",
      "url": "https://acme-hvac.example/",
      "status": "completed",
      "isTrial": false,
      "createdAt": "2026-11-21T10:00:00.000Z",
      "readyCount": 10,
      "totalCount": 11
    }
  ]
}`,
    notes: [
      "status is one of extracting, awaiting_confirm, queued, generating, completed, partial, failed, canceled.",
      "Weekly Drop packs also have a title, like \"Weekly Drop · Nov 17\".",
    ],
  },
  {
    id: "get-run",
    method: "GET",
    path: "/api/zapier/runs/{id}",
    summary: "One Ad Pack with its ads and image links. Zapier uses it for \"Find Ad Pack\" and after \"Generate Ads From a Website\".",
    params: [{ name: "id", where: "path, required", desc: "The Ad Pack id (runId from POST /api/ads/runs)." }],
    notes: [
      "done is true when the pack is finished and no more ads are coming. Stop polling then.",
      "locked_count counts ready ads you can't download yet (free pack). Locked ads have no links.",
      "error is a plain sentence when the pack ran into a problem, else null.",
    ],
    curl: `curl ${BASE}/api/zapier/runs/cmrun0sample \\\n  -H "Authorization: Bearer kmd_YOUR_KEY"`,
    status: "200 OK",
    response: `{
  "id": "cmrun0sample",
  "run_id": "cmrun0sample",
  "website": "https://acme-hvac.example/",
  "status": "completed",
  "done": true,
  "is_trial": false,
  "created_at": "2026-11-21T10:00:00.000Z",
  "completed_at": "2026-11-21T10:05:00.000Z",
  "ready_count": 10,
  "total_count": 10,
  "locked_count": 0,
  "error": null,
  "download_note": null,
  "image_url": "${IMG}",
  "image_urls": ["${IMG}"],
  "ads": [${indent(AD_JSON, 4)}],
  "links_expire_at": "2026-11-28T10:05:00.000Z",
  "view_url": "https://www.komendly.com/ads/runs/cmrun0sample",
  "upgrade_url": "https://www.komendly.com/pricing?utm_source=zapier&utm_medium=integration"
}`,
  },
  {
    id: "ready-ads",
    method: "GET",
    path: "/api/zapier/ads",
    summary: "Your newest ready ads with image links, newest first. Each ad has a stable id, so you can skip ads you have already seen. Zapier's \"Ads Ready\" trigger polls it.",
    params: [
      { name: "limit", where: "query", desc: "1 to 100. Default 50." },
      { name: "run_id", where: "query", desc: "Optional. Only ads from this Ad Pack." },
    ],
    notes: ["Only ready ads with at least one downloadable link are listed. created_at is when the ad became ready."],
    curl: `curl "${BASE}/api/zapier/ads?limit=50&run_id=cmrun0sample" \\\n  -H "Authorization: Bearer kmd_YOUR_KEY"`,
    status: "200 OK",
    response: `{
  "ads": [${indent(AD_JSON, 4)}]
}`,
  },
];

const ERRORS = [
  { code: "400", text: "invalid_input (body is not valid, e.g. no url) or blocked_url (not a public website)." },
  { code: "401", text: "unauthenticated: the key is missing, wrong or revoked. Make a new key at Dashboard > API." },
  { code: "402", text: "Payment needed. insufficient_credits (with needed and available), trial_used, brand_limit, or a free-pack rule such as domain_used. Upgrade or top up at /pricing." },
  { code: "403", text: "suspended (account suspended) or api_key_refused (keys can't be used on that route)." },
  { code: "404", text: "not_found: the Ad Pack doesn't exist or isn't in your workspace." },
  { code: "409", text: "busy: on an unlimited plan, wait for your current pack to finish, then start the next." },
  { code: "429", text: "rate_limited or job_limited. See the limits below. Wait and try again." },
  { code: "500", text: "internal: something went wrong on our side. Try again." },
];

const H2 = "font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl";
const PRE = "mt-3 overflow-x-auto whitespace-pre rounded-md bg-black/40 p-3 font-mono text-xs text-foreground";

export default function ApiDocsPage() {
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <StudioNav signedIn={false} />
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <section className="pt-8 sm:pt-14">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Developers · REST API</p>
          <h1 className="font-display mt-3 text-balance text-[2.3rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-6xl">Komendly API</h1>
          <p className="mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
            Start Ad Packs from a website and get the finished Meta ads with image links. This is the API our Zapier app uses. All requests and responses are JSON.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Using an AI agent? Connect the <a href="/agents" className={link}>Ozzy MCP server</a> instead. For scripts, the npm CLI <a href="https://www.npmjs.com/package/komendly" className={link}><code className="font-mono">komendly</code></a> wraps the same API.
          </p>
          <nav aria-label="Endpoints" className="mt-6 flex flex-wrap gap-2 text-xs">
            {ENDPOINTS.map((e) => (
              <a key={e.id} href={`#${e.id}`} className="rounded-md border border-border px-2 py-1 font-mono text-foreground hover:border-[var(--studio-gold)]">{e.method} {e.path}</a>
            ))}
          </nav>
        </section>

        <section className="py-12" aria-labelledby="auth-title">
          <h2 id="auth-title" className={H2}>Base URL and authentication</h2>
          <pre className={PRE}><code>{BASE}</code></pre>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Sign in and open <a href="/dashboard/api" className={link}>Dashboard &gt; API</a> ({BASE}/dashboard/api).</li>
            <li>Create a personal API key. It starts with <code className="font-mono text-foreground">kmd_</code>. Keep it secret.</li>
            <li>Send it on every request in the Authorization header.</li>
          </ol>
          <pre className={PRE}><code>Authorization: Bearer kmd_YOUR_KEY</code></pre>
          <p className="mt-3 text-sm text-muted-foreground">The key acts as you: same account, plan and credits as the web app. You can revoke it at Dashboard &gt; API at any time.</p>
        </section>

        {ENDPOINTS.map((e) => (
          <section key={e.id} id={e.id} className="scroll-mt-20 border-t border-border py-12" aria-labelledby={`${e.id}-title`}>
            <h2 id={`${e.id}-title`} className="font-mono text-xl text-foreground sm:text-2xl">
              <span className="text-[var(--studio-gold)]">{e.method}</span> {e.path}
            </h2>
            <p className="mt-3 text-muted-foreground">{e.summary}</p>
            {e.params && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="py-2 pr-4">Name</th><th className="py-2 pr-4">In</th><th className="py-2">Description</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {e.params.map((p) => (
                      <tr key={p.name}>
                        <td className="py-2 pr-4 align-top font-mono text-foreground">{p.name}</td>
                        <td className="whitespace-nowrap py-2 pr-4 align-top text-muted-foreground">{p.where}</td>
                        <td className="py-2 align-top text-muted-foreground">{p.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {e.notes && (
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {e.notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            )}
            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Example request</p>
            <pre className={PRE}><code>{e.curl}</code></pre>
            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Example response · {e.status}</p>
            <pre className={PRE}><code>{e.response}</code></pre>
          </section>
        ))}

        <section className="border-t border-border py-12" aria-labelledby="errors-title">
          <h2 id="errors-title" className={H2}>Errors</h2>
          <p className="mt-3 text-sm text-muted-foreground">Errors come back as JSON with an HTTP status, a plain-language <code className="font-mono text-foreground">error</code> you can show to people, and a stable <code className="font-mono text-foreground">code</code>. Some errors add fields, like <code className="font-mono text-foreground">needed</code> and <code className="font-mono text-foreground">available</code> credits, or an <code className="font-mono text-foreground">upgrade_url</code>.</p>
          <pre className={PRE}><code>{`HTTP/1.1 402 Payment Required
{
  "error": "This needs 11 credits and you have 4. Top up or upgrade to continue.",
  "code": "insufficient_credits",
  "needed": 11,
  "available": 4
}`}</code></pre>
          <ul className="mt-5 space-y-2 text-sm">
            {ERRORS.map((x) => (
              <li key={x.code} className="flex gap-3"><span className="w-10 shrink-0 font-mono text-[var(--studio-gold)]">{x.code}</span><span className="text-muted-foreground">{x.text}</span></li>
            ))}
          </ul>
        </section>

        <section className="border-t border-border py-12" aria-labelledby="limits-title">
          <h2 id="limits-title" className={H2}>Credits and limits</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>New accounts get a free Ad Pack: {FREE_PACK_LINE}. {UNLOCK_LINE}.</li>
            <li>Paid Ad Packs use credits: 1 credit per static ad per ratio, plus 5 credits per animated ad. Credits are held when the pack starts. Unlimited plans don&apos;t use credits.</li>
            <li>Each API key can make up to 120 requests per minute and start up to 30 jobs (like new Ad Packs) per hour.</li>
            <li>Each account can start up to 10 Ad Packs per hour.</li>
            <li>Over a limit you get 429. Wait a minute (or an hour for job limits) and try again.</li>
          </ul>
        </section>

        <section className="border-t border-border py-12" aria-labelledby="links-title">
          <h2 id="links-title" className={H2}>Image links expire</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Image and video links are presigned links. They work without a key, so tools like Slack, Google Sheets or Meta can fetch them. Each link is valid for 7 days. <code className="font-mono text-foreground">links_expire_at</code> tells you when. Call the endpoint again for fresh links, or save the files before they expire.
          </p>
        </section>

        <section className="border-t border-border py-12" aria-labelledby="more-title">
          <h2 id="more-title" className={H2}>More ways in</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li><a href="/agents" className={link}>MCP server for AI agents</a>: add {BASE}/api/mcp to Claude, ChatGPT or Cursor and sign in. No key needed.</li>
            <li>npm CLI: <code className="font-mono text-foreground">npx komendly login</code>, then run commands from your terminal with a key from Dashboard &gt; API.</li>
            <li><a href="/integrations" className={link}>All integrations</a>.</li>
          </ul>
        </section>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
