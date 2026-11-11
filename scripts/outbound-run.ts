// Queue a cold-outbound lead run (same as the "Add leads" button on /admin/ads/outbound): the engine finds leads with a
// public email on their own site and makes one hook ad each. Sending stays off unless OUTBOUND_ENABLED=1 on the engine.
//   set -a; . ./.env.local; set +a; npx tsx scripts/outbound-run.ts --niche roofers --city "Denver, CO" [--city "Austin, TX"] [--count 10] [--wait]
import { PrismaClient } from "@prisma/client";
import { OutboundRunSchema } from "../src/lib/ads/outbound/server-schema";

function args(argv: string[]): { niche: string; cities: string[]; count: number; wait: boolean } {
  const out = { niche: "", cities: [] as string[], count: 10, wait: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1] ?? "";
    if (a === "--niche") (out.niche = v), i++;
    else if (a === "--city") out.cities.push(v), i++;
    else if (a === "--count") (out.count = Number(v)), i++;
    else if (a === "--wait") out.wait = true;
  }
  return out;
}

async function main(): Promise<void> {
  const a = args(process.argv.slice(2));
  const parsed = OutboundRunSchema.safeParse(a);
  if (!parsed.success) {
    console.error(`usage: --niche roofers --city "Denver, CO" [--count 10] [--wait]\n${parsed.error.issues[0]?.message ?? ""}`);
    process.exit(2);
  }
  const prisma = new PrismaClient();
  try {
    const run = await prisma.outboundRun.create({ data: { ...parsed.data, createdBy: "cli" } });
    console.log(`queued outbound run ${run.id}: ${run.niche} in ${run.cities.join("; ")} (${run.count})`);
    if (!a.wait) return;
    for (;;) {
      await new Promise((r) => setTimeout(r, 10_000));
      const r = await prisma.outboundRun.findUnique({ where: { id: run.id } });
      if (r && (r.status === "done" || r.status === "failed")) {
        console.log(`${r.status}: ${r.found} leads`, JSON.stringify(r.result));
        return;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
