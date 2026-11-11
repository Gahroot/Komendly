// Claims lint for Komendly: product facts must match the knowledge file (billing-config.ts), no invented stats,
// testimonials or customer counts, competitor prices must be cited and dated "as of <Month YYYY>", nothing disparaging.
import { loadKnowledge, allowedPrices, allowedNumbers } from './knowledge.js';
import { stripCode } from './validator.js';

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
export const AS_OF = new RegExp(`\\bas of (${MONTHS}) \\d{4}\\b`, 'i');
const KOMENDLY = /\b(komendly|ozzy)\b/i;
const PRICE = /\$\s?(\d[\d,]*(?:\.\d+)?)/g;
const CUSTOMER_COUNT = /\b(\d[\d,.]*\s*k?\+?|thousands|hundreds|millions|tens of thousands)\s+(of\s+)?(happy\s+)?(customers|users|brands|businesses|marketers|teams|companies|agencies|advertisers|clients|stores|shops)\b/i;
const RATING = /\b\d(\.\d)?\s*(\/\s*5|out of 5|stars?)\b|\b(5|five)-star\b/i;
const TESTIMONIAL = /\b(testimonials? from|customers? (say|love|rave)|users? (say|love|rave)|rave reviews|"[^"]{10,}"\s*[-–—]\s*[A-Z][a-z]+)/;
const PERF = /\b(increase[sd]?|boost(s|ed)?|lift(s|ed)?|improve[sd]?|cut(s)?|reduce[sd]?|double[sd]?|triple[sd]?)\b[^.]{0,60}\b(\d+(\.\d+)?\s?(%|x|percent))/i;
const PERF2 = /\b\d+(\.\d+)?\s?(%|x|percent)\s+(higher|lower|more|less|better|faster|cheaper|increase|lift|boost|improvement)\b/i;
const DISPARAGE = /\b(scam(s|my)?|rip-?off|fraud(ulent)?|garbage|trash|useless|terrible|awful|horrible|worst|pathetic|joke of a|sucks?|crap(py)?|shady|predatory|liars?|lying)\b/i;
const STAT = /(\d+(\.\d+)?\s?%|\b\d+(\.\d+)?x\b|\b\d{1,3}(,\d{3})+\b|\b\d+(\.\d+)?\s?(million|billion)\b)/i;

export function sentences(text) {
  return String(text || '').replace(/\n(\s*[-*]|\s*\d+\.)\s+/g, '\n').split(/(?<=[.!?])\s+(?=[A-Z0-9"'(*\[])|\n+/).map((s) => s.trim()).filter(Boolean);
}

/** Table rows count as their own "sentences" so a price cell is judged with its row. */
function units(post) {
  const body = stripCode(post.body);
  return [post.title, post.description, post.answer, ...(post.key_takeaways || []), ...(post.faq || []).flatMap((f) => [f.q, f.a]), ...sentences(body)]
    .filter(Boolean).map(String);
}

export function competitorNames(post, competitors = []) {
  const names = new Set([...(post.competitors || []), ...competitors.map((c) => c.name)].filter(Boolean));
  return [...names].filter((n) => !/komendly/i.test(n));
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Returns a list of problems (empty = clean).
 * opts: { knowledge, competitors (seed list), now (Date) }
 */
export function claimsLint(post, { knowledge = loadKnowledge(), competitors = [] } = {}) {
  const issues = [];
  const prices = allowedPrices(knowledge);
  const nums = allowedNumbers(knowledge);
  const comps = competitorNames(post, competitors);
  const compRe = comps.length ? new RegExp(`(${comps.map(esc).join('|')})`, 'i') : null;
  const short = (s) => `"${s.replace(/\s+/g, ' ').slice(0, 140)}"`;
  for (const s of units(post)) {
    const mentionsK = KOMENDLY.test(s);
    const mentionsC = compRe ? compRe.test(s) : false;
    if (CUSTOMER_COUNT.test(s) && (mentionsK || /\b(our|we)\b/i.test(s))) issues.push(`invented customer/user count: ${short(s)}`);
    if (mentionsK && RATING.test(s)) issues.push(`Komendly rating/stars: ${short(s)}`);
    if (TESTIMONIAL.test(s) && (mentionsK || !/\[\^\d+\]/.test(s))) issues.push(`testimonial/review quote: ${short(s)}`);
    if (mentionsK && !mentionsC && (PERF.test(s) || PERF2.test(s))) issues.push(`Komendly performance stat: ${short(s)}`);
    if (DISPARAGE.test(s)) issues.push(`disparaging language: ${short(s)}`);
    const found = [...s.matchAll(PRICE)].map((m) => m[1].replace(/,/g, '').replace(/\.00$/, ''));
    if (found.length) {
      if (mentionsC) {
        // Competitor price: must be cited and dated.
        if (!/\[\^\d+\]/.test(s)) issues.push(`competitor price without a citation: ${short(s)}`);
        if (!AS_OF.test(s) && !AS_OF.test(post.body || '') ) issues.push(`competitor price not dated "as of <Month YYYY>": ${short(s)}`);
        else if (!AS_OF.test(s) && !/\|/.test(s)) issues.push(`competitor price not dated "as of <Month YYYY>" in the same sentence: ${short(s)}`);
      } else if (mentionsK) {
        for (const p of found) if (!prices.has(p)) issues.push(`Komendly price $${p} is not in the product facts (billing-config.ts): ${short(s)}`);
      } else if (!/\[\^\d+\]/.test(s)) {
        issues.push(`price without a named product or citation: ${short(s)}`);
      }
    }
    if (mentionsK && !mentionsC) {
      // Credits / trial numbers about Komendly must match the facts.
      for (const m of s.matchAll(/\b(\d+)\s+(credits?|static ads?|animated ads?|free ads?)\b/gi)) {
        if (!nums.has(m[1])) issues.push(`Komendly number "${m[0]}" not in the product facts: ${short(s)}`);
      }
      if (/\bfree trial\b|\bfree ads?\b/i.test(s) && /\b(\d+)\s+(free\s+)?(static\s+)?ads\b/i.test(s)) {
        const n = s.match(/\b(\d+)\s+(free\s+)?(static\s+)?ads\b/i)[1];
        if (!['10', '11', '1'].includes(n)) issues.push(`Komendly free trial is 10 static + 1 animated ad: ${short(s)}`);
      }
      if (/\b(credit card required|requires a (credit )?card)\b/i.test(s)) issues.push(`Komendly trial needs no card: ${short(s)}`);
      if (/money-back/i.test(s) && /\b(\d+)-day\b/.test(s) && s.match(/\b(\d+)-day\b/)[1] !== '30') issues.push(`guarantee is 30 days: ${short(s)}`);
      if (/\b(tiktok|google ads|linkedin|pinterest|snapchat)\b/i.test(s) && /\b(publish|post|push|send)\w*\b/i.test(s) && !/\b(not|no|doesn'?t|does not|only)\b/i.test(s)) issues.push(`Komendly only publishes to Meta: ${short(s)}`);
    }
    // Any statistic needs a citation in the same sentence (no invented stats).
    if (STAT.test(s.replace(PRICE, '')) && !/\[\^\d+\]/.test(s) && !mentionsK) issues.push(`statistic without a citation: ${short(s)}`);
  }
  const ids = new Set((post.sources || []).map((x) => String(x.id)));
  for (const c of post.claims || []) {
    if (!ids.has(String(c.source))) issues.push(`unsourced claim: ${c.text}`);
    if (compRe && compRe.test(c.text) && PRICE.test(c.text) && !AS_OF.test(c.text)) issues.push(`competitor price claim not dated "as of <Month YYYY>": ${short(c.text)}`);
    PRICE.lastIndex = 0;
  }
  return [...new Set(issues)];
}
