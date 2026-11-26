// Writes this week's content queue (ad of the week + trade playbook posts) to docs/growth-ecosystem/content-queue.json.
// No env or DB needed: npx tsx scripts/content-queue.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { buildContentQueue } from "../src/lib/growth/content-queue";

mkdirSync("docs/growth-ecosystem", { recursive: true });
const q = buildContentQueue(new Date());
writeFileSync("docs/growth-ecosystem/content-queue.json", JSON.stringify(q, null, 2) + "\n");
console.log(`content queue ${q.week}: ${q.items.length} items, trades ${q.trades.join(", ")}`);
