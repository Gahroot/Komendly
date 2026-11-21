// Live smoke test of the Meta Ad Check scanner + grader against the public Ad Library. No DB writes:
// the AdsEvent cache is an in-memory stub. Run from engine/ (its deps/tsconfig):
//   cd engine && npx tsx scripts/ad-check-live.ts [target ...]
// Default targets: Gator Metal Roofing's Facebook Page and website.
import { scanPageDetailed, type AdlibDb } from "../src/growth/adlib-scan";
import { buildAdCheckReport } from "../../src/lib/growth/ad-check";

const memDb = (): AdlibDb & { rows: Array<{ name: string; props: object }> } => {
  const rows: Array<{ name: string; props: object }> = [];
  return {
    rows,
    adsEvent: {
      async findFirst() { return null; }, // never reuse: always scan live
      async create(a) { rows.push(a.data); return a.data; },
    },
  };
};

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ["https://www.facebook.com/gatorhomeprofessionals/", "gatormetalroofing.com"];

async function main() {
  let ok = 0;
  for (const t of targets) {
    const db = memDb();
    const t0 = Date.now();
    console.log(`\n=== ${t}`);
    try {
      const r = await scanPageDetailed(db, t);
      if (!r) { console.log("no page / no active ads found", { ms: Date.now() - t0 }); continue; }
      const { scan, total } = r;
      console.log("AdlibPageScan:", {
        pageId: scan.pageId, pageName: scan.pageName, total, parsedAds: scan.liveAds.length, ms: Date.now() - t0,
        firstAds: scan.liveAds.slice(0, 3).map((a) => ({ id: a.adArchiveId, format: a.format, startedAt: a.startedAt, runDays: a.runDays, body: a.body.slice(0, 80) })),
      });
      const report = buildAdCheckReport(scan, total, []);
      console.log("Graded:", { score: report.score, liveCount: report.liveCount, oldestDays: report.oldestDays, formatMix: report.formatMix, fatigued: report.fatigued.length });
      for (const c of report.checks) console.log(`  ${c.pass ? "PASS" : "FAIL"} ${c.label}: ${c.points}/${c.max} - ${c.fact}`);
      ok++;
    } catch (e) {
      console.log("ERROR", e instanceof Error ? e.stack : e);
    }
  }
  process.exit(ok ? 0 : 1);
}
void main();
