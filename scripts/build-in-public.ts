// Build in public: snapshot REAL numbers from the DB (read-only SELECTs) and write post drafts to
// docs/growth-ecosystem/build-in-public/<date>.{json,md}. Never posts. Usage:
//   npx tsx --env-file=.env.local scripts/build-in-public.ts          (writes files)
//   npx tsx --env-file=.env.local scripts/build-in-public.ts --print  (stdout only)
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { buildDrafts, checkDraft, type BipSnapshot } from "../src/lib/growth/build-in-public";

const DIR = path.join(process.cwd(), "docs/growth-ecosystem/build-in-public");

async function main(): Promise<void> {
  // Imported lazily: ecosystem-queries pulls the app's prisma singleton (needs DATABASE_URL, set by --env-file).
  const { loadEcosystemLive } = await import("../src/lib/growth/ecosystem-queries");
  const prisma = new PrismaClient();
  const live = await loadEcosystemLive();
  const posted = await prisma.klySocialPost.count({ where: { status: "posted" } });
  const snap: BipSnapshot = {
    date: new Date().toISOString().slice(0, 10),
    signupsTotal: live.sources.reduce((a, s) => a + s.signups, 0),
    signups7d: live.signups7d,
    payingCustomers: live.payingCustomers,
    coldEmailsSent: live.klySendsTotal,
    socialPostsPosted: posted,
    systemsOn: live.systems.filter((s) => s.enabled).length,
    systemsTotal: live.systems.length,
    topSources: [...live.sources].sort((a, b) => b.signups - a.signups).slice(0, 3).map((s) => ({ source: s.source, signups: s.signups })),
  };
  let prev: BipSnapshot | null = null;
  try {
    const files = (await readdir(DIR)).filter((f) => f.endsWith(".json") && f !== `${snap.date}.json`).sort();
    if (files.length) prev = JSON.parse(await readFile(path.join(DIR, files[files.length - 1]!), "utf8")).snapshot as BipSnapshot;
  } catch { /* first run */ }
  const drafts = buildDrafts(snap, prev).map((d) => ({ ...d, blocked: checkDraft(d, snap) }));
  const md = [`# Build in public draft ${snap.date}`, "", "Status: DRAFT. Post by hand or via the desktop agent; see docs/audit/desktop-tasks.md.", "", ...drafts.flatMap((d) => [`## ${d.platform}${d.blocked ? ` (BLOCKED: ${d.blocked})` : ""}`, "", d.text, "", `Link: ${d.link}`, ""])].join("\n");
  if (process.argv.includes("--print")) { console.log(JSON.stringify({ snapshot: snap, drafts }, null, 2)); }
  else {
    await mkdir(DIR, { recursive: true });
    await writeFile(path.join(DIR, `${snap.date}.json`), JSON.stringify({ snapshot: snap, drafts }, null, 2));
    await writeFile(path.join(DIR, `${snap.date}.md`), md);
    console.log(`wrote ${DIR}/${snap.date}.{json,md}`);
  }
  await prisma.$disconnect();
}
void main();
