// Send exact copies of real cold emails (recent leads, both formats) to external test inboxes (e.g. mail-tester.com).
// Read-only on leads: composes copy, sends only to the given addresses. Usage: tsx kly/scripts/spam-test.ts <from> <to1> [to2...]
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { composeFor, outboundEnv, smtpTransport, copyArms } from "../src/sender";
import { loadMailboxes } from "../src/mailboxes";
import { unsubscribeHeaders, type EmailFormat } from "../../src/lib/ads/outbound/copy";

const [from, ...tos] = process.argv.slice(2);
const db = new PrismaClient();
const boxes = await loadMailboxes(db as never);
const m = boxes.find((b) => b.address === from);
if (!m) throw new Error(`no mailbox ${from}`);
const cfg = outboundEnv();
const leads = await db.outboundLead.findMany({ where: { status: "sent", adId: { not: null } }, orderBy: { lastSentAt: "desc" }, take: tos.length });
for (const [i, to] of tos.entries()) {
  const lead = leads[i % leads.length]!;
  const arms = await copyArms(db as never, lead, Math.random, 0);
  const format: EmailFormat = i % 2 === 0 ? "html" : "plain";
  const c = await composeFor(db as never, null, cfg, lead, 1, m.name, { variant: arms.variant, format });
  if (c.error) { console.log(to, "compose error", c.error); continue; }
  await smtpTransport(m)({ from: `"${m.name}" <${m.address}>`, to, subject: c.subject, text: c.text, html: c.html, messageId: `<${randomUUID()}@${m.address.split("@")[1]}>`, headers: unsubscribeHeaders(c.ctx.unsubscribeUrl, m.address) });
  console.log("sent", format, "to", to, "subject:", c.subject);
}
await db.$disconnect();
