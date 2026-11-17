// Retire whole sending domains: delete their mailboxes at Maildoso, remove them from Kly's store and mark the domain
// retired (no warm-up, no cold, no auto-resume). Only domains whose mailboxes never sent cold mail or own a lead.
//   set -a; . ../.env.local; set +a; DATABASE_URL=<prod> npx tsx scripts/maildoso-retire.ts comendly.com kommendly.com [--apply]
import { PrismaClient } from "@prisma/client";
import { listMaildosoAccounts } from "../src/maildoso";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const domains = args.filter((a) => !a.startsWith("--")).map((d) => d.toLowerCase());
const token = process.env.MAILDOSO_API_TOKEN;
if (!token || !domains.length) throw new Error("need MAILDOSO_API_TOKEN and domains");
const db = new PrismaClient();
const rows = await db.outboundMailbox.findMany({ where: { domain: { in: domains } }, select: { id: true } });
const ids = rows.map((r) => r.id);
const [sends, leads] = await Promise.all([db.outboundSend.count({ where: { mailboxId: { in: ids } } }), db.outboundLead.count({ where: { mailboxId: { in: ids } } })]);
if (sends || leads) throw new Error(`refusing: ${sends} sends / ${leads} leads use these mailboxes`);
const accts = (await listMaildosoAccounts(token)).filter((a) => domains.includes(String(a.email_account).split("@")[1]?.toLowerCase() ?? ""));
console.log(JSON.stringify({ domains, klyRows: ids.length, maildosoAccounts: accts.length, apply }));
if (apply) {
  for (let i = 0; i < accts.length; i += 50) {
    const res = await fetch("https://api.maildoso.com/v1/user/accounts", { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(accts.slice(i, i + 50).map((a) => a.id)) });
    console.log("maildoso delete batch", i / 50 + 1, res.status);
    if (!res.ok) throw new Error(`maildoso delete ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const del = await db.outboundMailbox.deleteMany({ where: { id: { in: ids } } });
  const reason = "retired: Spamhaus DBL-listed look-alike, replaced (Nov 16)";
  await db.outboundDomain.updateMany({ where: { domain: { in: domains } }, data: { paused: true, pausedReason: reason, capAuto: false } });
  await db.klyDecision.create({ data: { kind: "pause", summary: `Retired ${domains.join(", ")} (Spamhaus DBL-listed misspelling domains): deleted ${accts.length} Maildoso mailboxes, removed ${del.count} from Kly. Replaced by new domains.`, data: { domains } } });
  console.log(JSON.stringify({ deletedKly: del.count }));
}
await db.$disconnect();
