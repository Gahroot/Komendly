// Takes down today's (ET) Ozzy social posts on Meta and deletes their KlySocialPost rows so the next tick reposts.
// Usage: railway run --service kly -- env DATABASE_URL=<public url> npx tsx kly/scripts/social-undo-today.ts [--apply]
import { PrismaClient } from "@prisma/client";
import { openSecret } from "../src/mailboxes";
import { etDay } from "../../src/lib/kly/social-core";

const apply = process.argv.includes("--apply");
const db = new PrismaClient();
const v = process.env.META_GRAPH_VERSION || "v25.0";
const day = etDay(new Date());
const conn = await db.klySocialConnection.findUnique({ where: { id: "komendly" } });
if (!conn) throw new Error("not connected");
const token = openSecret(conn.pageTokenEnc, process.env.ADS_TOKEN_KEY?.trim());
const rows = await db.klySocialPost.findMany({ where: { day } });
for (const r of rows) {
  console.log(r.platform, r.status, r.postId, r.imageUrl);
  if (!apply) continue;
  if (r.postId) {
    const u = new URL(`https://graph.facebook.com/${v}/${r.postId}`);
    u.searchParams.set("access_token", token);
    const res = await fetch(u, { method: "DELETE" });
    const body = (await res.text()).replace(token, "***").slice(0, 200);
    console.log("  delete", r.platform, res.status, body);
    if (!res.ok) continue; // keep the row (blocks a duplicate repost) when Meta refused
  }
  await db.klySocialPost.delete({ where: { id: r.id } });
  console.log("  row removed");
}
await db.$disconnect();
