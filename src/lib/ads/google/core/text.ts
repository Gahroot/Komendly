// Limit-safe ad text (framework-free). Google counts "display width": most characters 1, wide East-Asian characters 2.
// We strip emoji/symbols Google's editorial policy rejects, avoid ALL-CAPS words and repeated punctuation, and trim at
// word boundaries so every string passes the RSA limits.

const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/u;

export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += WIDE.test(ch) ? 2 : 1;
  return w;
}

/** Characters we keep: letters, marks, digits, spaces and plain punctuation. Everything else (emoji, ★ ✓ • ™ etc.) goes. */
const DISALLOWED = /[^\p{L}\p{M}\p{N} .,;:'"!?&%$€£¥\-/()+#@]/gu;

const ACRONYMS = new Set(["HVAC", "NASA", "FIFA", "ASAP", "SaaS", "CPAP", "HIPAA", "USDA", "LGBT", "NYPD"]);

export function cleanText(raw: unknown, o: { allowExclamation?: boolean } = {}): string {
  let s = String(raw ?? "")
    .normalize("NFC")
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/\u2026/g, "...")
    .replace(DISALLOWED, " ");
  // Excess punctuation: "!!!" -> "!", "??" -> "?", "..." -> "." (Google rejects repeated punctuation).
  s = s.replace(/([!?.,;:])\1+/g, "$1").replace(/[!?]{2,}/g, (m) => m[0]!);
  s = o.allowExclamation ? s.replace(/!(?=.*!)/g, ".") : s.replace(/!/g, ".");
  // ALL-CAPS words (4+ letters) -> Capitalised; 2-3 letter acronyms and known 4-letter ones (HVAC) stay.
  s = s.replace(/\p{Lu}{4,}/gu, (w) => (ACRONYMS.has(w) ? w : w[0] + w.slice(1).toLowerCase()));
  s = s.replace(/\s+([.,;:!?])/g, "$1").replace(/\.(?=\s*\.)/g, "").replace(/\s+/g, " ").trim();
  // A headline can't start with punctuation.
  return s.replace(/^[\s.,;:!?\-/&+]+/, "").trim();
}

/** Trim to max display width at a word boundary; drops dangling joiners/punctuation. */
export function fitWidth(s: string, max: number): string {
  if (displayWidth(s) <= max) return s.replace(/[\s,;:\-/&+]+$/, "").trim();
  const words = s.split(" ");
  let out = "";
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (displayWidth(next) > max) break;
    out = next;
  }
  if (!out) {
    // One very long word: cut by characters.
    for (const ch of s) {
      if (displayWidth(out + ch) > max) break;
      out += ch;
    }
  }
  return out.replace(/[\s,;:\-/&+]+$/, "").replace(/\s+(and|or|the|a|an|of|to|for|with|in|on|at|&)$/i, "").trim();
}

export function headlineText(raw: unknown, max = 30): string {
  return fitWidth(cleanText(raw).replace(/[.]+$/, ""), max);
}

export function descriptionText(raw: unknown, max = 90): string {
  const s = fitWidth(cleanText(raw, { allowExclamation: true }), max);
  if (!s) return s;
  // Ends like a sentence when there is room.
  return /[.!?]$/.test(s) || displayWidth(s) >= max ? s : `${s}.`;
}

/** Display path (path1/path2): letters, digits and hyphens, <= 15. */
export function pathText(raw: unknown, max = 15): string {
  const words = cleanText(raw).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").trim().split(/\s+/).filter(Boolean);
  let out = "";
  for (const w of words) {
    const next = out ? `${out}-${w}` : w;
    if (displayWidth(next) > max) break;
    out = next;
  }
  if (!out && words[0]) for (const ch of words[0]) { if (displayWidth(out + ch) > max) break; out += ch; }
  return out;
}

/** Keyword text: lowercase words, no symbols Google rejects in keywords, <= 80 chars and <= 10 words. */
export function keywordText(raw: unknown): string {
  const words = cleanText(raw).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s'&.-]/gu, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, 10);
  let out = "";
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > 80) break;
    out = next;
  }
  return out.replace(/[.\-']+$/, "");
}

export function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const k = s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (!s || !k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/** Validation errors for user-edited copy (server re-check); [] = OK. */
export function searchCopyErrors(c: { headlines: string[]; descriptions: string[]; path1: string; path2: string }, L = { headline: 30, description: 90, path: 15, headlinesMin: 3, headlinesMax: 15, descriptionsMin: 2, descriptionsMax: 4 }): string[] {
  const errs: string[] = [];
  const hs = c.headlines.map((h) => h.trim()).filter(Boolean);
  const ds = c.descriptions.map((d) => d.trim()).filter(Boolean);
  if (hs.length < L.headlinesMin || hs.length > L.headlinesMax) errs.push(`Use ${L.headlinesMin} to ${L.headlinesMax} headlines.`);
  if (ds.length < L.descriptionsMin || ds.length > L.descriptionsMax) errs.push(`Use ${L.descriptionsMin} to ${L.descriptionsMax} descriptions.`);
  hs.forEach((h, i) => {
    if (displayWidth(h) > L.headline) errs.push(`Headline ${i + 1} is longer than ${L.headline} characters.`);
    if (h.includes("!")) errs.push(`Headline ${i + 1} can't use "!".`);
    if (cleanText(h) !== h.replace(/\s+/g, " ").trim()) errs.push(`Headline ${i + 1} has symbols, emoji or ALL-CAPS Google won't accept.`);
  });
  ds.forEach((d, i) => {
    if (displayWidth(d) > L.description) errs.push(`Description ${i + 1} is longer than ${L.description} characters.`);
    if (cleanText(d, { allowExclamation: true }) !== d.replace(/\s+/g, " ").trim()) errs.push(`Description ${i + 1} has symbols, emoji, ALL-CAPS or repeated punctuation Google won't accept.`);
  });
  if (dedupe(hs).length !== hs.length) errs.push("Headlines must all be different.");
  for (const [n, p] of [["Path 1", c.path1], ["Path 2", c.path2]] as const) {
    if (p && (displayWidth(p) > L.path || !/^[\p{L}\p{N}-]+$/u.test(p))) errs.push(`${n} must be up to ${L.path} letters, digits or hyphens.`);
  }
  if (!c.path1 && c.path2) errs.push("Path 2 needs Path 1.");
  return errs;
}
