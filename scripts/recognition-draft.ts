// Ad of the Month draft: read-only SELECT of AdsFeature (consented ads only), writes docs/growth-ecosystem/recognition/<month>.md.
// Usage: npx tsx --env-file=.env.local scripts/recognition-draft.ts [YYYY-MM]   (default: previous month). Never posts or emails.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { buildAwardDraft, checkAward, monthOf, pickAdOfTheMonth } from "../src/lib/growth/recognition";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const now = new Date();
  const month = process.argv[2] ?? monthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  const rows = await prisma.adsFeature.findMany({ select: { id: true, adId: true, brandName: true, handle: true, status: true, consentAt: true, featuredAt: true } });
  const f = pickAdOfTheMonth(rows, month);
  if (!f) { console.log(`no consented ad for ${month} (AdsFeature rows: ${rows.length})`); await prisma.$disconnect(); return; }
  const d = buildAwardDraft(f, month);
  const problem = checkAward(d, f);
  const dir = path.join(process.cwd(), "docs/growth-ecosystem/recognition");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${month}.md`), [`# ${d.title}`, "", `Status: DRAFT${problem ? ` (BLOCKED: ${problem})` : ""}. Feature it in /admin/ads/features, then post.`, "", d.caption, "", `Notice email: ${d.notice.subject}`, "", d.notice.text, ""].join("\n"));
  console.log(`wrote recognition/${month}.md for ad ${f.adId}${problem ? ` BLOCKED: ${problem}` : ""}`);
  await prisma.$disconnect();
}
void main();
