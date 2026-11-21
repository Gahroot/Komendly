// Snapshot the public Meta Ad Library advertiser sample into the anonymous aggregate the site renders
// (/reports/local-service-meta-ads + /ad-examples/longest-running/<trade>). No env or DB needed.
// Usage: npx tsx scripts/build-adlib-report.ts [jsonl dir or files...] [--collected YYYY-MM-DD]
//   default input: ~/.ezcoder/goals/paying-custys/adlib/*.jsonl; default collected date: newest input file's mtime (UTC).
// Writes src/lib/growth/adlib-report-data.json (commit it). Names, page URLs and websites never reach the output.
// Monthly refresh: re-collect the JSONL (or, once engine/src/growth/adlib-scan.ts lands, export its rows), rerun, commit.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { buildAdlibReport, type AdlibRow } from "../src/lib/growth/adlib-report";

const args = process.argv.slice(2);
const ci = args.indexOf("--collected");
const collectedArg = ci >= 0 ? args.splice(ci, 2)[1] : null;
const inputs = args.length ? args : [path.join(homedir(), ".ezcoder/goals/paying-custys/adlib")];
const files = inputs.flatMap((p) => (statSync(p).isDirectory() ? readdirSync(p).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(p, f)) : [p])).sort();
if (!files.length) throw new Error(`no .jsonl files in ${inputs.join(", ")}`);

const rows: AdlibRow[] = [];
let bad = 0;
for (const f of files) {
  for (const l of readFileSync(f, "utf8").split("\n")) {
    if (!l.trim()) continue;
    try { rows.push(JSON.parse(l) as AdlibRow); } catch { bad++; }
  }
}
const collectedOn = collectedArg ?? new Date(Math.max(...files.map((f) => statSync(f).mtimeMs))).toISOString().slice(0, 10);
// Common-English list for the leaderboard redaction (lowercase entries only = not proper nouns). Required: fail closed.
const dictFile = process.env.ADLIB_WORDS_FILE ?? "/usr/share/dict/words";
const english = new Set(readFileSync(dictFile, "utf8").split("\n").filter((w) => /^[a-z]+$/.test(w)));
if (english.size < 50_000) throw new Error(`word list ${dictFile} too small (${english.size})`);
const report = buildAdlibReport(rows, collectedOn, new Date(), { english });
const out = path.join(process.cwd(), "src/lib/growth/adlib-report-data.json");
writeFileSync(out, JSON.stringify(report, null, 1) + "\n");
console.log(`${files.length} files, ${rows.length} rows (${bad} unparseable) -> ${report.advertisers} advertisers, ${report.byTrade.length} trades, ${report.byState.length} states shown; indexable=${report.indexable}`);
console.log(`live ads median ${report.liveAds.median} (mean ${report.liveAds.mean}); days running median ${report.runDays.median}; 90+ days ${report.runDays.over90Share}%; offer ${report.signals.offerShare}%`);
console.log(`wrote ${out}`);
