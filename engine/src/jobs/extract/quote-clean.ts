// Testimonial cards often render "NG  Nolan Grout  YouTuber  I love it…": the avatar
// initials, name and role leak into the crawled quote. Strip that prefix.

const SENTENCE_START = new Set(
  "i i'm i've i'd this the we we've my it it's our since after if when honestly before what absolutely best great amazing love so finally just thanks thank as these they he she you your komendly".split(" "),
);
const QUOTE_MARK = /^["“”'‘’«]/;

export interface CleanedQuote {
  quote: string;
  attribution?: string;
}

const word = (t: string) => t.replace(/[^\p{L}'’]/gu, "").toLowerCase();

export function cleanTestimonialQuote(raw: string): CleanedQuote {
  const text = raw.trim();
  // Explicit quote mark after a short prefix: everything before it is attribution.
  const qm = text.slice(1).search(/["“«]/);
  if (qm >= 0 && qm + 1 <= 80 && !QUOTE_MARK.test(text)) {
    const attribution = text.slice(0, qm + 1).trim().replace(/[\s,:–—-]+$/, "");
    const quote = text.slice(qm + 1).trim().replace(/^["“«]+/, "").replace(/["”»]+$/, "").trim();
    if (attribution && quote.length >= 10) return { quote, attribution };
  }
  const toks = text.split(/\s+/);
  const first = toks[0] ?? "";
  if (!/^\p{Lu}{1,3}$/u.test(first)) return { quote: text };
  // Name words must match the initials (NG -> Nolan Grout).
  const n = first.length;
  const name = toks.slice(1, 1 + n);
  if (name.length < n || !name.every((w, i) => w.normalize("NFD")[0]?.toUpperCase() === first[i])) return { quote: text };
  let i = 1 + n;
  // Role: up to 5 tokens until a sentence-start word or quote mark.
  const roleStart = i;
  while (i < toks.length && i - roleStart < 5) {
    const t = toks[i] ?? "";
    if (QUOTE_MARK.test(t) || SENTENCE_START.has(word(t))) break;
    i++;
  }
  if (i - roleStart >= 5) i = roleStart; // no clear sentence start: keep the role in the quote
  const quote = toks.slice(i).join(" ").replace(/^["“'‘]+/, "").replace(/["”'’]+$/, "").trim();
  if (quote.length < 10) return { quote: text };
  return { quote, attribution: toks.slice(1, i).join(" ").replace(/[,;:–—-]+$/, "") };
}
