// Find public posts where businesses ask for ads / creative help and queue them (never posts anything).
//   npx tsx scripts/intent-discover.ts [--file kly/data/intent-queue.json] [--dry] [--events]
// --events also writes AdsEvent "intent_opportunity" rows (needs DATABASE_URL; leave off to stay file-only).
import { resolve } from "node:path";
import { INTENT_EVENT, intentEventProps, runIntentDiscovery, type IntentFetch } from "../src/intent-queue";
import { UA } from "../src/site-signals";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const fetchIt: IntentFetch = async (url) => {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json, application/rss+xml, */*" }, signal: AbortSignal.timeout(15_000) });
  await new Promise((ok) => setTimeout(ok, 2000)); // polite gap between sources
  return { status: r.status, text: await r.text() };
};
const file = resolve(arg("--file") ?? "data/intent-queue.json");
const res = await runIntentDiscovery({ fetch: fetchIt, file, dry: process.argv.includes("--dry") });
console.log(JSON.stringify({ file, scanned: res.scanned, added: res.added.length, total: res.total, errors: res.errors }, null, 1));
if (process.argv.includes("--events") && !process.argv.includes("--dry") && res.added.length) {
  const db = (await import("../src/db")).createDb();
  for (const o of res.added) await db.adsEvent.create({ data: { name: INTENT_EVENT, props: intentEventProps(o) as never } });
  await db.$disconnect();
}
