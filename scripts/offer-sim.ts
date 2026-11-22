// Offer simulator: synthetic buyer personas vote on offer variants through a cheap model (claude CLI, default haiku).
// Run: npx tsx scripts/offer-sim.ts [--model haiku] [--personas 36] [--concurrency 12] [--out .ezcoder/tmp/offer-sim]
// No env needed: uses the local `claude` login. Personas are synthetic (no customer data leaves the machine).
// Two tests per persona: monadic (sees one offer, rates it) and pairwise (picks Option 1, Option 2 or neither, order
// randomized). Results are resumable (JSONL cache keyed by call id). LLM panels skew optimistic and are weak on absolute
// price sensitivity: trust the ranking and the objections, not the buy rates. The real test is live traffic.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AD_DEPARTMENT_STACK, stackTotalUsd } from "../src/lib/ads/billing-config";

const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1]! : d; };
const MODEL = arg("model", "haiku");
const N_PERSONAS = Number(arg("personas", "36"));
const CONCURRENCY = Number(arg("concurrency", "12"));
const OUT = arg("out", ".ezcoder/tmp/offer-sim");

// ---------- Offers ----------
interface Offer { key: string; name: string; text: string }
const currentStack = AD_DEPARTMENT_STACK.map((s) => `- ${s.label}: ${s.detail} (worth $${s.valueUsd}/mo)`).join("\n");
const launchCore = `Ozzy is an AI ad manager. Paste your website and he:
- Makes your Facebook & Instagram ads from your site in about 10 minutes (you see them free before paying)
- Launches them on your own Meta ad account in one click (you set the daily budget; you pay Meta directly for ad spend)
- Checks results every day, pauses the ads that lose money and moves budget to the winners
- Makes fresh ads + a 15s video every Monday so ads never go stale
- Sends you a plain-English results email every week: spend, sales, cost per sale`;
export const OFFERS: readonly Offer[] = [
  { key: "A_creatives_197", name: "Ozzy Ad Department (ad creatives)", text: `Ozzy Ad Department - $197/month (founding price, locked while subscribed)
AI that makes ads for your business from your website. You download them and run them yourself.
${currentStack}
Total value $${stackTotalUsd()}/mo.
Guarantee: post Ozzy's ads for 30 days. Not happy? One click, full refund.` },
  { key: "B_launch_197_firstsale", name: "Ozzy runs your ads, first-sale guarantee", text: `Ozzy - your AI ad manager - $197/month (founding price, locked while subscribed)
${launchCore}
Guarantee 1: not happy in 30 days? One click, full refund.
Guarantee 2: no sale from your ads in your first 30 days? Your next month is free, and it stays free until they work (needs the Meta pixel installed and at least $20/day ad spend).` },
  { key: "C_launch_97_firstsale", name: "Ozzy runs your ads at $97", text: `Ozzy - your AI ad manager - $97/month (founding price, locked while subscribed)
${launchCore}
Guarantee 1: not happy in 30 days? One click, full refund.
Guarantee 2: no sale from your ads in your first 30 days? Your next month is free, and it stays free until they work (needs the Meta pixel installed and at least $20/day ad spend).` },
  { key: "D_launch_297_roas", name: "Ozzy runs your ads at $297, money-back on results", text: `Ozzy - your AI ad manager - $297/month (founding price, locked while subscribed)
${launchCore}
Guarantee: if your ads don't bring in more sales than you paid us in your first 60 days, we refund every dollar you paid us (needs the Meta pixel installed and at least $20/day ad spend).` },
  { key: "E_launch_197_refundonly", name: "Ozzy runs your ads, refund only", text: `Ozzy - your AI ad manager - $197/month (founding price, locked while subscribed)
${launchCore}
Guarantee: not happy in 30 days? One click, full refund.` },
  { key: "Z_control_497", name: "Sanity control: creatives at $497, no guarantee", text: `Ozzy Ad Department - $497/month
AI that makes ads for your business from your website. You download them and run them yourself.
${currentStack}
No refunds.` },
];

// ---------- Personas (seeded, weighted by the real signup mix: online ~40%, local ~30%, professional ~17%) ----------
function mulberry32(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SEGMENTS = [
  { key: "ecom", w: 0.24, biz: ["a supplements brand on Shopify", "a skincare brand on Shopify", "a pet products store", "a handmade jewelry shop"], rev: [8, 80] },
  { key: "saas", w: 0.14, biz: ["a 2-person B2B SaaS", "a bootstrapped scheduling app", "an indie AI tool"], rev: [3, 40] },
  { key: "local_venue", w: 0.14, biz: ["a coffee shop", "a dental practice", "a hair salon", "a bakery"], rev: [25, 120] },
  { key: "local_service", w: 0.14, biz: ["a roofing company", "a landscaping company", "a house cleaning service", "a plumbing company"], rev: [30, 150] },
  { key: "professional", w: 0.18, biz: ["a real estate agent", "a solo accountant", "an interior designer", "a business coach"], rev: [8, 60] },
  { key: "agency", w: 0.08, biz: ["a freelance marketer with 4 small clients", "a 3-person social media agency"], rev: [6, 40] },
  { key: "info", w: 0.08, biz: ["an online course creator", "a fitness coach selling programs"], rev: [4, 50] },
] as const;
const EXPERIENCE = [
  { key: "never", w: 0.4, text: "You have never run paid ads and do not have a Meta ad account set up. Ads Manager looks confusing to you." },
  { key: "boosted", w: 0.35, text: "You have boosted a few Facebook/Instagram posts and spent maybe $200 total, with no clear result." },
  { key: "runs", w: 0.25, text: "You run Meta ads most months yourself, spending $500-3,000/month, and know what CPA and ROAS mean." },
] as const;
const ATTITUDES = ["skeptical: you have been burned by an agency that charged $1,500/month and got nothing", "price-sensitive: every subscription is scrutinized and you cancel most tools within 2 months", "busy and open: you would pay to not think about marketing, if you trust it works", "cautious: you worry AI ads look fake and hurt your brand"];
const pickW = <T extends { w: number }>(xs: readonly T[], r: number) => { let acc = 0; for (const x of xs) { acc += x.w; if (r < acc) return x; } return xs[xs.length - 1]!; };

export interface Persona { id: string; segment: string; experience: string; text: string }
export function buildPersonas(n: number, seed = 20261119): Persona[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => {
    const seg = pickW(SEGMENTS, rnd());
    const exp = pickW(EXPERIENCE, rnd());
    const biz = seg.biz[Math.floor(rnd() * seg.biz.length)]!;
    const rev = Math.round((seg.rev[0] + rnd() * (seg.rev[1] - seg.rev[0])) * 1000);
    const att = ATTITUDES[Math.floor(rnd() * ATTITUDES.length)]!;
    const text = `You own ${biz}, doing about $${rev.toLocaleString("en-US")}/month in revenue. ${exp.text} Attitude: ${att}.`;
    return { id: `p${String(i).padStart(2, "0")}`, segment: seg.key, experience: exp.key, text };
  });
}

// ---------- Model calls ----------
const SYSTEM = `You are role-playing a specific real small-business owner who just landed on a product page. Stay fully in character.
Be realistic, not polite: most owners do not buy most offers they see, cash is tight, you have seen many AI tools overpromise, and you only know what the page says. Answer only with the requested JSON.`;
const MONADIC_SCHEMA = { type: "object", properties: {
  gut_reaction: { type: "string", description: "one sentence, in your voice" },
  likelihood_0_10: { type: "integer", minimum: 0, maximum: 10, description: "how likely you are to start paying this week" },
  would_buy_now: { type: "boolean" },
  max_monthly_price_usd: { type: "integer", description: "the most you would pay per month for exactly this" },
  biggest_objection: { type: "string" },
  setup_blocker: { type: "string", description: "anything you'd need to do or set up first that might stop you; 'none' if nothing" },
  what_would_change_mind: { type: "string" },
}, required: ["gut_reaction", "likelihood_0_10", "would_buy_now", "max_monthly_price_usd", "biggest_objection", "setup_blocker", "what_would_change_mind"] };
const PAIR_SCHEMA = { type: "object", properties: {
  choice: { type: "string", enum: ["option_1", "option_2", "neither"] },
  reason: { type: "string" },
}, required: ["choice", "reason"] };

function claude(prompt: string, schema: object): Promise<{ out: Record<string, unknown>; cost: number }> {
  return new Promise((resolve, reject) => {
    const p = spawn("claude", ["-p", "--model", MODEL, "--output-format", "json", "--system-prompt", SYSTEM, "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence", "--json-schema", JSON.stringify(schema), prompt], { cwd: "/tmp", stdio: ["ignore", "pipe", "pipe"] });
    let so = "", se = "";
    p.stdout.on("data", (d) => (so += d));
    p.stderr.on("data", (d) => (se += d));
    p.on("close", (code) => {
      try {
        const d = JSON.parse(so) as { structured_output?: Record<string, unknown>; total_cost_usd?: number; is_error?: boolean };
        if (code !== 0 || d.is_error || !d.structured_output) throw new Error(`exit ${code}: ${(se || so).slice(0, 300)}`);
        resolve({ out: d.structured_output, cost: d.total_cost_usd ?? 0 });
      } catch (e) { reject(e); }
    });
  });
}

interface Job { id: string; kind: "monadic" | "pair"; persona: Persona; offers: Offer[]; prompt: string }
interface Result { id: string; kind: Job["kind"]; persona: string; segment: string; experience: string; offers: string[]; out: Record<string, unknown>; cost: number }

function jobs(personas: Persona[], rnd: () => number): Job[] {
  const out: Job[] = [];
  for (const p of personas) {
    for (const o of OFFERS) {
      out.push({ id: `m:${p.id}:${o.key}`, kind: "monadic", persona: p, offers: [o], prompt: `${p.text}\n\nYou are looking at this offer:\n"""\n${o.text}\n"""\n\nReact honestly as yourself.` });
    }
    for (let i = 0; i < OFFERS.length; i++) for (let j = i + 1; j < OFFERS.length; j++) {
      const pair = rnd() < 0.5 ? [OFFERS[i]!, OFFERS[j]!] : [OFFERS[j]!, OFFERS[i]!];
      out.push({ id: `v:${p.id}:${OFFERS[i]!.key}|${OFFERS[j]!.key}`, kind: "pair", persona: p, offers: pair, prompt: `${p.text}\n\nYou can sign up for one of these two offers, or neither.\n\nOption 1:\n"""\n${pair[0]!.text}\n"""\n\nOption 2:\n"""\n${pair[1]!.text}\n"""\n\nWhich would you actually pay for this week? Choose "neither" if you would not pay for either.` });
    }
  }
  return out;
}

// ---------- Report ----------
const pct = (x: number) => `${Math.round(x * 100)}%`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function report(results: Result[], personas: Persona[]): string {
  const mon = results.filter((r) => r.kind === "monadic");
  const pairs = results.filter((r) => r.kind === "pair");
  const lines: string[] = [`# Offer simulation (${MODEL}, ${personas.length} personas, ${results.length} calls, $${results.reduce((a, r) => a + r.cost, 0).toFixed(2)})`, "", "Synthetic panel: trust the ranking and objections, not the absolute buy rates.", ""];
  lines.push("## Monadic (each persona sees one offer)", "", "| Offer | Buy now | Mean likelihood /10 | Median max $/mo | Never-ran-ads buy now |", "|---|---|---|---|---|");
  const rows = OFFERS.map((o) => {
    const rs = mon.filter((r) => r.offers[0] === o.key);
    const buy = mean(rs.map((r) => (r.out.would_buy_now ? 1 : 0)));
    const lik = mean(rs.map((r) => Number(r.out.likelihood_0_10) || 0));
    const wtp = rs.map((r) => Number(r.out.max_monthly_price_usd) || 0).sort((a, b) => a - b)[Math.floor(rs.length / 2)] ?? 0;
    const nev = rs.filter((r) => r.experience === "never");
    return { o, buy, lik, wtp, nev: mean(nev.map((r) => (r.out.would_buy_now ? 1 : 0))) };
  }).sort((a, b) => b.lik - a.lik);
  for (const r of rows) lines.push(`| ${r.o.name} | ${pct(r.buy)} | ${r.lik.toFixed(1)} | $${r.wtp} | ${pct(r.nev)} |`);
  lines.push("", "## Pairwise votes (win rate when shown; order randomized)", "", "| Offer | Wins | Shown | Win rate | Neither rate |", "|---|---|---|---|---|");
  const win = OFFERS.map((o) => {
    const shown = pairs.filter((r) => r.offers.includes(o.key));
    const wins = shown.filter((r) => { const c = r.out.choice; return (c === "option_1" && r.offers[0] === o.key) || (c === "option_2" && r.offers[1] === o.key); }).length;
    return { o, wins, shown: shown.length, neither: shown.filter((r) => r.out.choice === "neither").length };
  }).sort((a, b) => b.wins / b.shown - a.wins / a.shown);
  for (const w of win) lines.push(`| ${w.o.name} | ${w.wins} | ${w.shown} | ${pct(w.wins / Math.max(1, w.shown))} | ${pct(w.neither / Math.max(1, w.shown))} |`);
  lines.push("", "## Likelihood by segment and ad experience", "");
  const groups = [...new Set(personas.map((p) => p.segment)), ...new Set(personas.map((p) => `exp:${p.experience}`))];
  lines.push(`| Group (n) | ${OFFERS.map((o) => o.key.split("_")[0]).join(" | ")} |`, `|---|${OFFERS.map(() => "---").join("|")}|`);
  for (const g of groups) {
    const inG = (r: Result) => (g.startsWith("exp:") ? r.experience === g.slice(4) : r.segment === g);
    const n = personas.filter((p) => (g.startsWith("exp:") ? p.experience === g.slice(4) : p.segment === g)).length;
    lines.push(`| ${g} (${n}) | ${OFFERS.map((o) => mean(mon.filter((r) => inG(r) && r.offers[0] === o.key).map((r) => Number(r.out.likelihood_0_10) || 0)).toFixed(1)).join(" | ")} |`);
  }
  lines.push("", "## Verbatims", "");
  for (const o of OFFERS) {
    lines.push(`### ${o.name}`, "");
    for (const r of mon.filter((x) => x.offers[0] === o.key).slice(0, 36)) lines.push(`- (${r.segment}/${r.experience}, ${r.out.likelihood_0_10}/10) objection: ${r.out.biggest_objection} | blocker: ${r.out.setup_blocker} | would change mind: ${r.out.what_would_change_mind}`);
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const cache = join(OUT, `results-${MODEL}.jsonl`);
  const done = new Map<string, Result>();
  if (existsSync(cache)) for (const l of readFileSync(cache, "utf8").split("\n")) if (l.trim()) { const r = JSON.parse(l) as Result; done.set(r.id, r); }
  const personas = buildPersonas(N_PERSONAS);
  const all = jobs(personas, mulberry32(7));
  const todo = all.filter((j) => !done.has(j.id));
  console.log(`${all.length} calls (${todo.length} new), model ${MODEL}, concurrency ${CONCURRENCY}`);
  let next = 0, ok = 0, failed = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < todo.length) {
      const j = todo[next++]!;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { out, cost } = await claude(j.prompt, j.kind === "monadic" ? MONADIC_SCHEMA : PAIR_SCHEMA);
          const r: Result = { id: j.id, kind: j.kind, persona: j.persona.id, segment: j.persona.segment, experience: j.persona.experience, offers: j.offers.map((o) => o.key), out, cost };
          done.set(j.id, r);
          appendFileSync(cache, JSON.stringify(r) + "\n");
          ok++;
          break;
        } catch (e) {
          if (attempt === 1) { failed++; console.error(`failed ${j.id}: ${e instanceof Error ? e.message : e}`); }
        }
      }
      if ((ok + failed) % 50 === 0) console.log(`${ok + failed}/${todo.length}`);
    }
  }));
  const results = all.map((j) => done.get(j.id)).filter((r): r is Result => !!r);
  const md = report(results, personas);
  writeFileSync(join(OUT, `report-${MODEL}.md`), md);
  console.log(md.split("## Verbatims")[0]);
  if (failed) console.log(`${failed} calls failed; rerun to retry them.`);
}

if (process.argv[1]?.endsWith("offer-sim.ts")) void main();
