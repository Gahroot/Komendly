// Run the pitch emails in docs/data-report-pitch.md through the growth review gate (precheck + AI reviewer).
// Facts = the report numbers the emails quote (from src/lib/growth/adlib-report-data.json). Prints one verdict per email.
// Usage: cd engine && CODEX_AUTH_FILE=~/.ezcoder/auth.json npx tsx ../scripts/review-pitch-emails.ts [attempt]
import { readFileSync } from "node:fs";
import path from "node:path";
import { createProvider } from "../engine/src/providers/index";
import { reviewOnce, type TextFn } from "../src/lib/growth/review-gate";
import type { AdlibReport } from "../src/lib/growth/adlib-report";

const root = path.resolve(process.cwd(), process.cwd().endsWith("/engine") ? ".." : ".");
const doc = readFileSync(path.join(root, "docs/data-report-pitch.md"), "utf8");
const r = JSON.parse(readFileSync(path.join(root, "src/lib/growth/adlib-report-data.json"), "utf8")) as AdlibReport;
const one = r.liveAds.buckets.find((b) => b.label === "1 live ad")!;
const facts = [
  `Source: public Meta Ad Library, collected by Komendly on ${r.collectedOn}; US local service advertisers.`,
  `Advertisers in the sample: ${r.advertisers.toLocaleString("en-US")} across ${r.trades} trades and ${r.states} states (incl. DC).`,
  `Median live ads per advertiser: ${r.liveAds.median}. Exactly one live ad: ${one.advertisers.toLocaleString("en-US")} advertisers = ${one.share}%.`,
  `One sampled ad per advertiser: median ${r.runDays.median} days running; ${r.runDays.over90Share}% running 90+ days.`,
  `Ad text mentions an offer (free, a price, % off or deal words): ${r.signals.offerShare}% of ${r.signals.n.toLocaleString("en-US")} advertisers with ad text.`,
  "Trades include plumbers, roofers, dentists, med spas. Report: https://www.komendly.com/reports/local-service-meta-ads (charts, method, CSV, free to cite with a link). Leaderboards of longest-running ads per trade with names removed: https://www.komendly.com/ad-examples/longest-running",
  "Sender: Nolan Grout, Komendly. {first name} is the mail-merge slot filled by hand per recipient.",
].join("\n");

const emails = [...doc.matchAll(/<!-- email:(\w+) -->\n([\s\S]*?)<!-- \/email -->/g)].map((m) => ({ key: m[1]!, content: m[2]!.trim() }));
if (emails.length !== 3) throw new Error(`expected 3 emails, found ${emails.length}`);
const provider = createProvider("codex");
const text: TextFn = (req) => provider.text(req);
const attempt = process.argv[2] ?? "1";

async function main() {
console.log(`FACTS:\n${facts}\n`);
for (const e of emails) {
  const v = await reviewOnce(text, {
    system: "data_report", kind: "email", itemKey: `pitch:${e.key}:a${attempt}`, content: e.content.replace("{first name}", "Sam"), facts,
    extraRules: ["One-to-one pitch email sent by hand to a journalist, blogger or association; the reader did not opt in."],
  });
  console.log(`${e.key}: ${v.approved ? "APPROVED" : "REJECTED"}${v.reasons.length ? ` - ${v.reasons.join(" | ")}` : ""}${v.fix ? `\n  fix: ${v.fix}` : ""}`);
}
}
void main();
