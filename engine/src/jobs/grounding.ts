// Grounding: verify extracted quotes exist verbatim on the crawled pages, and map ad
// claims to BrandProfile facts. Pure functions (unit-tested).
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(
  "a an the and or but to of in on for with at by from is are was were be been it this that your you our we they their its as into than then so not no do does".split(" "),
);

export function tokens(s: string): string[] {
  return normalize(s)
    .replace(/[^a-z0-9%$.' ]/g, " ")
    .split(" ")
    .map((t) => t.replace(/^[.']+|[.']+$/g, ""))
    .filter((t) => t && !STOP.has(t));
}

export function jaccard(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export interface PageText {
  url: string;
  text: string;
}

/** Find the page whose text contains the quote verbatim (normalized). Prefers the claimed sourceUrl. */
export function locateQuote(quote: string, sourceUrl: string, pages: PageText[]): string | null {
  const q = normalize(quote);
  if (q.length < 3) return null;
  const ordered = [...pages].sort((a, b) => Number(b.url === sourceUrl) - Number(a.url === sourceUrl));
  for (const p of ordered) if (normalize(p.text).includes(q)) return p.url;
  return null;
}

/** Keep only items whose quote is found on a crawled page; fix sourceUrl to where it was found. */
export function keepGrounded<T extends { sourceUrl: string; quote?: string }>(items: T[], pages: PageText[]): { kept: T[]; dropped: T[] } {
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const it of items) {
    const at = it.quote ? locateQuote(it.quote, it.sourceUrl, pages) : null;
    if (at) kept.push({ ...it, sourceUrl: at });
    else dropped.push(it);
  }
  return { kept, dropped };
}

export interface Fact {
  claim: string;
  sourceUrl: string;
  quote: string;
}

/** Numbers/percent/money in a string — any number in an ad claim must appear in its fact. */
export function numbersIn(s: string): string[] {
  return (normalize(s).match(/\$?\d[\d,.]*\s?%?(k|m|x)?/g) ?? []).map((n) => n.replace(/[,\s]/g, "").replace(/\.$/, ""));
}

/**
 * Map each ad claim to a fact. A claim maps when it is (near-)identical to a fact claim
 * or quote (Jaccard >= threshold) and every number in the claim appears in that fact.
 */
export function mapClaimsToFacts(
  claims: Array<{ claim: string; sourceUrl: string }>,
  facts: Fact[],
  threshold = 0.5,
): Array<{ claim: string; sourceUrl: string; factIndex: number | null; score: number }> {
  return claims.map((c) => {
    let best = -1;
    let bestScore = 0;
    facts.forEach((f, i) => {
      const s = Math.max(jaccard(c.claim, f.claim), jaccard(c.claim, f.quote));
      const nums = numbersIn(c.claim);
      const factNums = new Set([...numbersIn(f.claim), ...numbersIn(f.quote)]);
      const numsOk = nums.every((n) => factNums.has(n));
      const bonus = f.sourceUrl === c.sourceUrl ? 0.05 : 0;
      if (numsOk && s + bonus > bestScore) {
        bestScore = s + bonus;
        best = i;
      }
    });
    return { ...c, factIndex: bestScore >= threshold ? best : null, score: bestScore };
  });
}

/** Complete sentence(s) = starts with a capital/quote/digit and ends with terminal punctuation. */
export function isCompleteSentence(s: string): boolean {
  const t = s.trim().replace(/^["“'‘(]+/, "").replace(/["”'’)]+$/, "");
  return /^[A-Z0-9]/.test(t) && /[.!?…]$/.test(t) && t.split(/\s+/).length >= 4;
}

/**
 * Expand a verbatim quote to the full sentence(s) that contain it in the page text,
 * so ads never start or end mid-sentence. Returns null when it can't be located.
 */
export function expandToSentence(quote: string, text: string, maxChars = 320): string | null {
  const flat = text.replace(/\s+/g, " ");
  const q = quote.trim().replace(/\s+/g, " ").replace(/^["“]+|["”]+$/g, "");
  let at = flat.indexOf(q);
  if (at < 0) {
    at = normalize(flat).indexOf(normalize(q));
    if (at < 0 || normalize(flat).length !== flat.length) return null;
  }
  const isEnd = (i: number) => /[.!?…]/.test(flat[i] ?? "") && (i + 1 >= flat.length || /[\s"”')]/.test(flat[i + 1] ?? ""));
  let start = at;
  while (start > 0 && !isEnd(start - 1) && at - start < maxChars && !/[\n•|]/.test(flat[start - 1] ?? "")) start--;
  let end = at + q.length - 1;
  while (end < flat.length - 1 && !isEnd(end) && end - at < maxChars) end++;
  const out = flat.slice(start, end + 1).trim().replace(/^["“”]+/, "").trim();
  return out.length <= maxChars + q.length ? out : null;
}
