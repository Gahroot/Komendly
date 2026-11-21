// Leak check for the public Ad Library data report (src/lib/growth/adlib-report-data.json). Exit 1 on any leak.
// Every advertiser page_name token (>= 4 chars) and domain stem is grepped case-insensitively (whole word) in the JSON.
// A match is a LEAK unless the token is ordinary vocabulary: a lowercase entry of the English word list (incl. plural)
// a US state/calendar word, or a word shared by >= 3 different advertisers' names or ad texts ("medspa", "hvac"): those
// describe a trade, not a business.
// Distinctive tokens (>= 6 chars) are also matched fuzzily (edit distance <= 2) against excerpt words: "Garrmamone".
// Usage: npx tsx scripts/check-adlib-report-leaks.ts [jsonl dir]   (default ~/.ezcoder/goals/paying-custys/adlib)
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { GENERIC_NAME_WORDS, PROPER_OK, editDistance, type AdlibReport } from "../src/lib/growth/adlib-report";

const dir = process.argv[2] ?? path.join(homedir(), ".ezcoder/goals/paying-custys/adlib");
const rows = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).flatMap((f) => readFileSync(path.join(dir, f), "utf8").split("\n"))
  .filter((l) => l.trim()).map((l) => { try { return JSON.parse(l) as { page_name?: string; domain?: string; ad_text_sample?: string }; } catch { return {}; } });
const english = new Set(readFileSync(process.env.ADLIB_WORDS_FILE ?? "/usr/share/dict/words", "utf8").split("\n").filter((w) => /^[a-z]+$/.test(w)));
// Dataset vocabulary: words used in the ad text of >= 3 different advertisers (the report's anonymity threshold).
const adVocab = new Map<string, number>();
for (const r of rows) for (const w of new Set(String(r.ad_text_sample ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u))) adVocab.set(w, (adVocab.get(w) ?? 0) + 1);
// Reviewed by hand (Nov 2026 data): ordinary words the 1934 web2 list lacks, as used in the published excerpts.
const REVIEWED = new Set(["boutique"]);
const firstNames = new Set(readFileSync("/usr/share/dict/propernames", "utf8").split("\n").map((w) => w.toLowerCase()));
const ordinaryWord = (w: string) => REVIEWED.has(w) || GENERIC_NAME_WORDS.has(w) || PROPER_OK.has(w) || (adVocab.get(w) ?? 0) >= 3 || [w, w.replace(/s$/, ""), w.replace(/es$/, ""), w.replace(/ies$/, "y")].some((f) => english.has(f));
/** Fuzzy side only: inflected English words ("hoping", "ruining") and first names ("Karen") are not misspelt business names. */
const ordinaryExcerptWord = (w: string) => ordinaryWord(w) || firstNames.has(w) || [w.replace(/ing$/, ""), w.replace(/ing$/, "e"), w.replace(/ed$/, ""), w.replace(/ed$/, "e"), w.replace(/by$/, "")].some((f) => f.length > 2 && english.has(f));

const tokenNames = new Map<string, Set<string>>();
for (const r of rows) {
  const name = String(r.page_name ?? "");
  const stem = String(r.domain ?? "").toLowerCase().replace(/^www\./, "").split(".")[0] ?? "";
  const toks = [...name.toLowerCase().split(/[^\p{L}\p{N}'’]+/u).map((t) => t.replace(/^['’]+|['’]+$/g, "").replace(/['’]s$/, "")), stem];
  for (const t of toks) if (t.length >= 4) tokenNames.set(t, (tokenNames.get(t) ?? new Set()).add(name));
}
const raw = readFileSync(path.join(process.cwd(), "src/lib/growth/adlib-report-data.json"), "utf8");
const json = raw.toLowerCase();
const report = JSON.parse(raw) as AdlibReport;
const excerptWords = new Set(report.leaderboards.flatMap((l) => l.entries.flatMap((e) => e.excerpt.toLowerCase().split(/[^\p{L}\p{N}]+/u))).filter((w) => w.length >= 4));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let ordinaryHits = 0;
const leaks: string[] = [];
for (const [t, names] of tokenNames) {
  const ordinary = ordinaryWord(t) || names.size >= 3;
  if (new RegExp(`(?<![\\p{L}\\p{N}])${esc(t)}(?![\\p{L}\\p{N}])`, "u").test(json)) {
    if (ordinary) ordinaryHits++;
    else leaks.push(`LEAK "${t}" (from "${[...names][0]}")`);
  }
  if (!ordinary && t.length >= 6) for (const w of excerptWords) if (w !== t && editDistance(w, t) <= 2 && !ordinaryExcerptWord(w)) leaks.push(`LEAK ~"${w}" ≈ "${t}" (from "${[...names][0]}")`);
}
console.log(`${rows.length} rows, ${tokenNames.size} distinct page-name/domain tokens >= 4 chars checked against adlib-report-data.json`);
console.log(`${ordinaryHits} ordinary-word tokens matched (English words or shared by 3+ advertiser names, e.g. "roofing")`);
for (const l of leaks) console.log(l);
console.log(leaks.length ? `${leaks.length} leaks` : "0 leaks");
process.exit(leaks.length ? 1 : 0);
