// Copy lint + truth check for any experiment copy. Pure. The banned patterns mirror src/lib/__tests__/public-copy-lint.test.ts
// (keep in sync; a test asserts the shared ones) and add the offer-intel rules: no new prices, no invented numbers,
// no new guarantees, no fake urgency, no promised results.
import { ALLOWED_PLAIN_NUMBERS, ALLOWED_PRICES, APPROVED_GUARANTEE_TEXTS, fillTokens } from "./facts";

export const PUBLIC_BANNED: readonly RegExp[] = [/guarantee[ds]? (leads|sales|revenue|roi)/i, /\bget \d+ (leads|customers|sign-?ups|appointments)/i, /one[- ]click/i];
const RESULT_PROMISES: readonly RegExp[] = [/\b(double|triple|10x|\d+x)\b/i, /\broas?\b|\broi\b/i, /\bskyrocket|explode|guaranteed? (results|growth|customers)|never miss a lead/i, /\bmore (leads|sales|customers|calls) (than|in)\b/i, /\bget (more )?(leads|sales|customers)\b/i];
const URGENCY: readonly RegExp[] = [/\bhurry\b|last chance|only today|ends (today|tonight|soon)|limited time|don'?t miss out|act now/i, /\bonly \d+\b/i, /\b\d+ (spots?|places?) (left|remaining)\b/i];
const NEW_OFFER: readonly RegExp[] = [/free (trial|month)|\d+ ?% off|% discount|\bdiscount\b|\bcoupon\b|save \$|price lock|\bfree forever\b/i];
const GUARANTEE_WORDS = /guarantee|refund|money[- ]back|risk[- ]free|no[- ]risk/i;

export interface LintResult { ok: boolean; problems: string[] }

function stripApproved(s: string): string {
  let out = s;
  for (const g of APPROVED_GUARANTEE_TEXTS) out = out.split(g).join(" ");
  return out;
}

/** Lint one string (tokens are filled first so numbers are checked against real facts). */
export function lintCopy(raw: string): LintResult {
  const text = fillTokens(raw);
  const problems: string[] = [];
  for (const re of PUBLIC_BANNED) if (re.test(text)) problems.push(`banned phrase ${re}`);
  for (const re of RESULT_PROMISES) if (re.test(text)) problems.push(`promises a result ${re}`);
  for (const re of URGENCY) if (re.test(text)) problems.push(`fake or invented urgency ${re}`);
  for (const re of NEW_OFFER) if (re.test(text)) problems.push(`introduces a new offer ${re}`);
  if (GUARANTEE_WORDS.test(stripApproved(text))) problems.push("new guarantee/refund wording (only the existing guarantee lines are allowed verbatim)");
  for (const m of text.matchAll(/\$\s?\d(?:[\d,]*\d)?(?:\.\d+)?/g)) {
    const price = m[0].replace(/\s/g, "");
    if (!ALLOWED_PRICES.has(price)) problems.push(`price ${price} is not in the offer facts`);
  }
  // Plain numbers (not part of a $ amount) must exist in the facts.
  for (const m of text.replace(/\$\s?\d(?:[\d,]*\d)?(?:\.\d+)?/g, " ").matchAll(/\b\d+(?:\.\d+)?\b/g)) {
    if (!ALLOWED_PLAIN_NUMBERS.has(Number(m[0]))) problems.push(`number ${m[0]} is not in the offer facts`);
  }
  if (/%/.test(text)) problems.push("percentages are not in the offer facts");
  return { ok: problems.length === 0, problems };
}
