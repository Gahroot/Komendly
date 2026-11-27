// The human/coordinator's inbox for executive build work. The executive layer NEVER changes code: it files `build_request` AdsEvents.
// Usage (set -a; . ./.env.local; set +a first):
//   npx tsx scripts/exec-build-queue.ts                 print pending requests as ready-to-paste worker briefs
//   npx tsx scripts/exec-build-queue.ts --start <id>    mark in_progress (you picked it up)
//   npx tsx scripts/exec-build-queue.ts --done <id> ["what shipped / how verified"]   mark done
//   npx tsx scripts/exec-build-queue.ts --all           include in_progress and done
import { PrismaClient } from "@prisma/client";
import { buildBrief } from "../src/lib/exec/coordinator";

const arg = (f: string) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const db = new PrismaClient();
  try {
    const start = arg("--start"), done = arg("--done");
    const target = start ?? done;
    if (target) {
      const row = await db.adsEvent.findFirst({ where: { id: target, name: "build_request" } });
      if (!row) throw new Error(`no build_request ${target}`);
      const props = { ...(row.props as Record<string, unknown>), status: start ? "in_progress" : "done", [start ? "startedAt" : "doneAt"]: new Date().toISOString(), ...(done && process.argv[process.argv.indexOf("--done") + 2] ? { result: process.argv[process.argv.indexOf("--done") + 2] } : {}) };
      await db.adsEvent.update({ where: { id: target }, data: { props: props as object } });
      console.log(`${target}: ${props.status}`);
      return;
    }
    const rows = await db.adsEvent.findMany({ where: { name: "build_request" }, orderBy: { createdAt: "asc" }, take: 200 });
    const show = process.argv.includes("--all") ? rows : rows.filter((r) => (r.props as { status?: string }).status === "pending");
    if (!show.length) { console.log("No pending build requests. (Valid state: nothing needs building; keep gathering evidence.)"); return; }
    for (const r of show) {
      const p = r.props as { title: string; kind: string; spec: string; acceptance: string[]; objectiveId?: string; status?: string };
      console.log(`\n===== ${r.id} [${p.status}] =====\n${buildBrief({ id: r.id, title: p.title, kind: p.kind, spec: p.spec, acceptance: p.acceptance ?? [], objectiveId: p.objectiveId })}\n\nmark: npx tsx scripts/exec-build-queue.ts --start ${r.id}   |   --done ${r.id} "result"`);
    }
  } finally { await db.$disconnect(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
