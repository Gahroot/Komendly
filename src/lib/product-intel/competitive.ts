// Competitive intelligence: a transparent rubric scoring Komendly against alternatives. Pure TS, no network (the fetching is
// scripts/competitive-scan.ts, run by hand, never in the engine). HONESTY RULES: a score exists only where a public page fact
// (URL + checked date) or, for Komendly, our own code supports it; everything else is `null` = "not verified" and is left OUT
// of totals (coverage is shown). Facts already verified for the compare pages come from src/lib/growth/organic/compare.ts
// (the source of truth); nothing here disparages anyone. Scores are 0-3 on a stated rule, not a judgement of overall quality.
import { COMPETITORS, VERIFIED_ON } from "../growth/organic/compare";
import { PUBLIC_OFFER } from "../ads/public-offer";

export const PROPOSAL_EVENT = "product_proposal";

export const RUBRIC = [
  { key: "time_to_first_ad", label: "Time to first ad", weight: 3, rule: "3 = finished ads from a link with no setup; 2 = guided setup, minutes to hours; 1 = build in an editor; 0 = days (brief + turnaround)." },
  { key: "effort", label: "Effort for a non-designer", weight: 3, rule: "3 = none beyond pasting a link; 2 = light review; 1 = operate a design/ads tool; 0 = manage people or learn the platform." },
  { key: "price", label: "Entry price", weight: 2, rule: "3 = free first result or <= $50/mo; 2 = <= $200/mo; 1 = <= $500/mo; 0 = above." },
  { key: "publishes_meta", label: "Publishes to Meta", weight: 2, rule: "3 = publishes to Facebook/Instagram ads from the tool; 1 = exports only; 0 = no." },
  { key: "learns_optimises", label: "Learns / optimises from results", weight: 2, rule: "3 = automated optimisation on live results; 2 = insights/reporting or rule-based pauses; 1 = manual A/B only; 0 = none." },
  { key: "local_focus", label: "Local-business focus", weight: 2, rule: "3 = built for local service businesses; 2 = SMB generalist; 1 = ecommerce/agency oriented; 0 = enterprise." },
  { key: "evidence", label: "Public proof of results", weight: 1, rule: "3 = published, verifiable customer results; 2 = vendor-stated aggregate claims; 1 = testimonials only; 0 = none." },
] as const;
export type DimKey = (typeof RUBRIC)[number]["key"];

export interface Evidence { url: string; checked: string; note: string }
export interface Score { score: 0 | 1 | 2 | 3 | null; evidence: Evidence[] }
export interface Entrant { slug: string; name: string; kind: "self" | "tool" | "service" | "diy"; scores: Record<DimKey, Score>; scanUrls: string[]; note?: string }

const NONE: Score = { score: null, evidence: [] };
const blank = (): Record<DimKey, Score> => ({ time_to_first_ad: NONE, effort: NONE, price: NONE, publishes_meta: NONE, learns_optimises: NONE, local_focus: NONE, evidence: NONE });
const ev = (url: string, note: string, checked = VERIFIED_ON): Evidence[] => [{ url, checked, note }];
const own = (note: string): Evidence[] => [{ url: "https://www.komendly.com/pricing", checked: VERIFIED_ON, note: `Own product (${note}); see src/lib/ads/public-offer.ts` }];

export const ENTRANTS: Entrant[] = [
  { slug: "komendly", name: "Komendly", kind: "self", scanUrls: [], note: "Self-assessed from our own code and offer; the weakest area (public proof) is stated plainly.", scores: {
    time_to_first_ad: { score: 3, evidence: own(`${PUBLIC_OFFER.freeAds} free ads from a pasted website link`) },
    effort: { score: 3, evidence: own("no editor; paste a link, review") },
    price: { score: 2, evidence: own(`free first pack, then ${PUBLIC_OFFER.diyPrice}/mo or ${PUBLIC_OFFER.heroPrice}/mo; dearer than several tools at entry`) },
    publishes_meta: { score: 3, evidence: own("launches Facebook/Instagram lead ads in the owner's own Meta account") },
    learns_optimises: { score: 2, evidence: own("daily checks pause ads wasting money; closed-loop learning not yet proven on real customer data") },
    local_focus: { score: 3, evidence: own("built for local service businesses") },
    evidence: { score: 1, evidence: own("no published customer results yet: not claimed") },
  } },
  { slug: "creatopy", name: "Creatopy", kind: "tool", scanUrls: ["https://www.creatopy.com/pricing/"], scores: { ...blank(),
    price: { score: 3, evidence: ev("https://www.creatopy.com/pricing/", "Pro listed at $39/month billed monthly") },
    publishes_meta: { score: 3, evidence: ev("https://www.creatopy.com/pricing/", "Ultra plan lists publishing to Meta and Google Ads") },
    effort: { score: 1, evidence: ev("https://www.creatopy.com/pricing/", "Ad Studio and canvas with 5,000+ templates: you operate a design tool") },
  } },
  { slug: "madgicx", name: "Madgicx", kind: "tool", scanUrls: ["https://madgicx.com/pricing"], scores: { ...blank(),
    price: { score: 3, evidence: ev("https://madgicx.com/pricing", "From $45/month for spend under $1K (billed monthly)") },
    learns_optimises: { score: 3, evidence: ev("https://madgicx.com/pricing", "Meta-ads optimisation and analytics platform with AI features") },
    publishes_meta: { score: 3, evidence: ev("https://madgicx.com/pricing", "Built around Meta campaigns (per its pricing and positioning)") },
    local_focus: { score: 1, evidence: ev("https://madgicx.com/pricing", "Positioned for ecommerce and ad-spend-based tiers") },
  } },
  { slug: "predis-ai", name: "Predis.ai", kind: "tool", scanUrls: ["https://predis.ai/pricing/"], scores: { ...blank(),
    price: { score: 3, evidence: ev("https://predis.ai/pricing/", "Advertises ads, videos and UGC for less than $1/day; 3-day free trial") },
    publishes_meta: { score: 3, evidence: ev("https://predis.ai/pricing/", "Can publish to Facebook, Instagram and others") },
  } },
  { slug: "adcreative-ai", name: "AdCreative.ai", kind: "tool", scanUrls: ["https://www.adcreative.ai/"], scores: { ...blank(),
    learns_optimises: { score: 2, evidence: ev("https://www.adcreative.ai/", "Lists creative insights and competitor insights") },
    evidence: { score: 2, evidence: ev("https://www.adcreative.ai/", "States 4.2M+ businesses and $35B+ ad-spend training data (vendor's own claims)") },
    local_focus: { score: 1, evidence: ev("https://www.adcreative.ai/", "Home page leans to ecommerce brands and agencies") },
  } },
  { slug: "canva-magic-studio", name: "Canva Magic Studio", kind: "tool", scanUrls: ["https://www.canva.com/pricing/", "https://www.canva.com/magic-studio/"], scores: blank(), note: "Not verified: canva.com/pricing returned HTTP 403 to automated fetch on 26 Nov 2026. Check in a browser; do not fill from memory." },
  { slug: "pencil", name: "Pencil", kind: "tool", scanUrls: ["https://www.trypencil.com/"], scores: { ...blank(),
    local_focus: { score: 0, evidence: ev("https://www.trypencil.com/", "Home page: \"AI Operating System for Marketing\" with enterprise governance; named customers L'Oreal, Unilever, Diageo, Salomon; CTA is Book a Demo", "2026-11-26") },
    evidence: { score: 2, evidence: ev("https://www.trypencil.com/", "Vendor-stated results with named brands (e.g. 33% cost cut producing 46K AI assets); not independently verified", "2026-11-26") },
  }, note: "Partly verified 26 Nov 2026 from the home page only. No public price (demo-led), so price is left unscored. Other dimensions not verified." },
  { slug: "smartly", name: "Smartly", kind: "tool", scanUrls: ["https://www.smartly.io/"], scores: blank(), note: "Not verified: 26 Nov 2026 fetch of smartly.io returned only a short marketing page (\"AI Advertising Platform\") with no price, segment or result claims to cite. Likely a different segment, but that is not a sourced claim." },
  { slug: "meta-advantage-plus", name: "Meta Advantage+ creative", kind: "tool", scanUrls: ["https://www.facebook.com/business/ads/meta-advantage-plus"], scores: blank(), note: "Not verified: facebook.com/business/ads/meta-advantage-plus returned HTTP 400 to automated fetch on 26 Nov 2026. It is the platform's own tooling, so any claim needs the current Meta page opened in a browser." },
  { slug: "freelancer-agency", name: "Hiring a freelancer or agency", kind: "service", scanUrls: [], scores: blank(), note: "No single public page; typical price and turnaround would be assumptions, so unscored." },
  { slug: "diy", name: "Doing it yourself", kind: "diy", scanUrls: [], scores: blank(), note: "Unscored: depends entirely on the owner's skill and time." },
];

// Keep the verified compare data in sync: every slug in COMPETITORS must be an entrant (tested).
export const COMPARE_SLUGS = COMPETITORS.map((c) => c.slug);

export interface Scorecard { slug: string; name: string; total: number | null; coverage: number; scored: number }
export function scoreEntrant(e: Entrant): Scorecard {
  let sum = 0, w = 0, tw = 0;
  for (const d of RUBRIC) { tw += d.weight; const s = e.scores[d.key].score; if (s !== null) { sum += s * d.weight; w += d.weight; } }
  return { slug: e.slug, name: e.name, total: w ? Math.round((sum / (w * 3)) * 100) : null, coverage: Math.round((w / tw) * 100), scored: RUBRIC.filter((d) => e.scores[d.key].score !== null).length };
}

/** A score without evidence is invalid: guards the honesty rule. */
export function validateEntrants(es: Entrant[]): string[] {
  const errs: string[] = [];
  for (const e of es) for (const d of RUBRIC) {
    const s = e.scores[d.key];
    if (s.score !== null && !s.evidence.length) errs.push(`${e.slug}.${d.key}: score without evidence`);
    for (const x of s.evidence) if (!/^https?:\/\//.test(x.url) || !/^\d{4}-\d{2}-\d{2}$/.test(x.checked)) errs.push(`${e.slug}.${d.key}: evidence needs url + checked date`);
  }
  return errs;
}

export interface Positioning { weWin: string[]; theyWin: string[]; underserved: string[] }
export function positioning(es: Entrant[] = ENTRANTS): Positioning {
  const me = es.find((e) => e.kind === "self")!, others = es.filter((e) => e.kind !== "self");
  const weWin: string[] = [], theyWin: string[] = [], underserved: string[] = [];
  for (const d of RUBRIC) {
    const mine = me.scores[d.key].score;
    const rivals = others.flatMap((o) => (o.scores[d.key].score === null ? [] : [{ n: o.name, s: o.scores[d.key].score as number }]));
    if (mine === null) continue;
    if (!rivals.length) { underserved.push(`${d.label}: no competitor verified yet (we score ${mine}/3, unverified against others).`); continue; }
    const best = Math.max(...rivals.map((r) => r.s));
    const better = rivals.filter((r) => r.s > mine).map((r) => r.n);
    if (better.length) theyWin.push(`${d.label}: ${better.join(", ")} score higher than us (${mine}/3) on the verified facts.`);
    else if (mine > best) weWin.push(`${d.label}: ${mine}/3 vs best verified alternative ${best}/3.`);
    if (rivals.every((r) => r.s <= 1)) underserved.push(`${d.label}: every verified alternative scores <= 1/3.`);
  }
  return { weWin, theyWin, underserved };
}

export interface DifferentiatorProposal { id: string; dimension: DimKey; title: string; why: string; effort: "S" | "M" | "L"; needs: string }
/** Product proposals (not decisions) that follow from where the verified scorecard says we are weaker or unproven. */
export function proposeDifferentiators(es: Entrant[] = ENTRANTS): DifferentiatorProposal[] {
  const me = es.find((e) => e.kind === "self")!, out: DifferentiatorProposal[] = [];
  const lag = (k: DimKey) => (me.scores[k].score ?? 0) <= 1 || es.some((o) => o.kind !== "self" && (o.scores[k].score ?? -1) > (me.scores[k].score ?? 0));
  if (lag("evidence")) out.push({ id: "diff-published-results", dimension: "evidence", title: "Publish consented, measured customer results (no invented numbers)", why: "Evidence is our lowest-scored rubric line; competitors cite aggregate claims we cannot honestly match yet.", effort: "M", needs: "Real customer data and consent (proof system exists: sys_proof)." });
  if (lag("price")) out.push({ id: "diff-entry-price", dimension: "price", title: "Make the first paid step cheaper than the lowest verified tool plan", why: "Several verified tools list entry plans well under our plan prices.", effort: "S", needs: "Owner pricing decision (never automatic); the $9 unlock already exists." });
  if (lag("learns_optimises")) out.push({ id: "diff-closed-loop", dimension: "learns_optimises", title: "Show the closed loop: which ad won, what we changed next week", why: "Optimisation platforms score 3; we are 2 until the loop is proven on real spend.", effort: "L", needs: "Real Meta spend data from paying customers." });
  out.push({ id: "diff-local-trade-packs", dimension: "local_focus", title: "Double down on local-trade presets (roofers, plumbers, dentists...)", why: "No verified alternative is built for local service businesses; this is the segment gap.", effort: "S", needs: "None: reuse /free-ads trade pages and Ad Library data." });
  return out;
}

export interface CompetitiveData { generatedOn: string; rubric: typeof RUBRIC; entrants: Array<Entrant & { card: Scorecard }>; positioning: Positioning; proposals: DifferentiatorProposal[] }
export function buildCompetitiveData(on: string, es: Entrant[] = ENTRANTS): CompetitiveData {
  return { generatedOn: on, rubric: RUBRIC, entrants: es.map((e) => ({ ...e, card: scoreEntrant(e) })), positioning: positioning(es), proposals: proposeDifferentiators(es) };
}

export function renderCompetitiveMarkdown(d: CompetitiveData): string {
  const L: string[] = [`# Competitive scorecard`, ``, `Generated ${d.generatedOn} by \`scripts/competitive-scan.ts\` from \`src/lib/product-intel/competitive.ts\`. Facts: the compare-page data (verified ${VERIFIED_ON}) and public vendor pages only. Blank = not verified, left out of totals.`, `Totals are weighted averages over the **scored** dimensions only (coverage shows how much of the rubric that is). Scores are 0-3 on the rule below, not a statement about overall product quality. Prices change: check the linked page.`, ``, `## Rubric`, ``];
  for (const r of d.rubric) L.push(`- **${r.label}** (weight ${r.weight}): ${r.rule}`);
  L.push(``, `## Scores`, ``, `| | ${d.rubric.map((r) => r.label).join(" | ")} | Total | Coverage |`, `|---|${d.rubric.map(() => "---").join("|")}|---|---|`);
  for (const e of d.entrants) L.push(`| ${e.name} | ${d.rubric.map((r) => (e.scores[r.key].score === null ? "n/v" : e.scores[r.key].score)).join(" | ")} | ${e.card.total === null ? "n/v" : e.card.total} | ${e.card.coverage}% |`);
  L.push(``, `n/v = not verified.`, ``, `## Where we win`, ``, ...(d.positioning.weWin.length ? d.positioning.weWin.map((x) => `- ${x}`) : [`- Nothing proven against verified alternatives yet.`]));
  L.push(``, `## Where alternatives win`, ``, ...(d.positioning.theyWin.length ? d.positioning.theyWin.map((x) => `- ${x}`) : [`- None found on verified facts.`]));
  L.push(``, `## Underserved`, ``, ...(d.positioning.underserved.length ? d.positioning.underserved.map((x) => `- ${x}`) : [`- None identified.`]));
  L.push(``, `## Differentiator proposals (owner decides)`, ``, ...d.proposals.map((p) => `- **${p.title}** [${p.effort}] (${p.dimension}): ${p.why} Needs: ${p.needs}`));
  L.push(``, `## Evidence`, ``);
  for (const e of d.entrants) for (const r of d.rubric) for (const x of e.scores[r.key].evidence) L.push(`- ${e.name} / ${r.label}: ${x.note} (${x.url}, checked ${x.checked})`);
  L.push(``, `## Not yet verified`, ``);
  for (const e of d.entrants.filter((x) => x.card.coverage < 100 && x.kind !== "self")) L.push(`- ${e.name}: ${e.card.scored}/${d.rubric.length} dimensions scored.${e.note ? ` ${e.note}` : ""}`);
  return L.join("\n") + "\n";
}
