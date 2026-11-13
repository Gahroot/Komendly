// End-to-end click-path check: sends one REAL cold email (a real sent lead's gift) to our own Gmail inbox from
// (a) a Gmail mailbox and (b) a Maildoso mailbox, finds each by Message-ID over IMAP (inbox or spam = placement),
// opens the claim link in a real Chromium, waits for the gift page's view beacon, checks the lead's click was counted,
// then puts the lead + gift counters back. Message-IDs carry the warm-up tag, so Kly's IMAP never treats them as replies.
//   set -a; . ../.env.local; set +a; npx tsx scripts/click-path-check.ts [--to hello@getkomendly.com] [--no-click]
import { createRequire } from "node:module";
import path from "node:path";
import { ImapFlow } from "imapflow";
import { createDb } from "../src/db";
import { loadMailboxes, type StoredMailbox } from "../src/mailboxes";
import { composeFor, copyArms, outboundEnv, smtpTransport } from "../src/sender";
import { seededRng } from "../src/arms";
import { junkFolder, warmupMessageId, warmupSecretOf } from "../src/warmup";
import { unsubscribeHeaders } from "../../src/lib/ads/outbound/copy";

const argv = process.argv.slice(2);
const opt = (k: string, d: string) => (argv.includes(k) ? (argv[argv.indexOf(k) + 1] ?? d) : d);
const TO = opt("--to", "hello@getkomendly.com");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function findPlacement(box: StoredMailbox, messageId: string): Promise<{ folder: "inbox" | "spam"; source: string } | null> {
  const c = new ImapFlow({ host: box.imapHost, port: box.imapPort, secure: box.imapPort === 993, auth: { user: box.user, pass: box.appPassword }, logger: false });
  await c.connect();
  try {
    const junk = junkFolder(await c.list());
    for (const [p, folder] of [["INBOX", "inbox"], ...(junk ? [[junk, "spam"]] : [])] as Array<[string, "inbox" | "spam"]>) {
      const lock = await c.getMailboxLock(p);
      try {
        const uids = (await c.search({ header: { "message-id": messageId.replace(/[<>]/g, "") } }, { uid: true })) || [];
        if (uids.length) {
          const m = await c.fetchOne(String(uids[0]), { source: true }, { uid: true });
          return { folder, source: m && m.source ? m.source.toString("utf8") : "" };
        }
      } finally {
        lock.release();
      }
    }
    return null;
  } finally {
    await c.logout().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const db = createDb();
  const cfg = outboundEnv();
  const secret = warmupSecretOf();
  const boxes = await loadMailboxes(db);
  const inbox = boxes.find((b) => b.address === TO);
  if (!inbox) throw new Error(`no stored mailbox ${TO}`);
  const senders = [boxes.find((b) => b.provider === "gmail" && b.address !== TO), boxes.find((b) => b.provider === "maildoso")].filter((b): b is StoredMailbox => Boolean(b));
  const lead = await db.outboundLead.findFirst({ where: { status: "sent", clickedAt: null, giftToken: { not: null }, adId: { not: null }, sends: { some: { dryRun: false } } }, orderBy: { lastSentAt: "desc" } });
  if (!lead?.giftToken) throw new Error("no sent prebuilt lead to test with");
  const gift = await db.adsGift.findUnique({ where: { token: lead.giftToken } });
  console.log(`lead: ${lead.businessName} (${lead.niche}), gift ${gift?.status}`);

  const sent: Array<{ from: string; provider: string; messageId: string; format: string }> = [];
  for (const [i, from] of senders.entries()) {
    const arms = await copyArms(db, lead, seededRng(Date.now() + i), 0);
    const format = i === 0 ? "html" : "plain";
    const c = await composeFor(db, null, cfg, lead, 1, from.name, { variant: arms.variant, format });
    if (c.error) throw new Error(`compose: ${c.error}`);
    const messageId = warmupMessageId(from.domain, secret);
    await smtpTransport(from)({ from: `"${from.name}" <${from.address}>`, to: TO, subject: c.subject, text: c.text, html: format === "html" ? c.html : null, messageId, headers: unsubscribeHeaders(c.ctx.unsubscribeUrl, from.address) });
    sent.push({ from: from.address, provider: from.provider, messageId, format });
    console.log(`sent ${format} from ${from.address} (${from.provider}): "${c.subject}"`);
  }

  const found = new Map<string, { folder: string; source: string }>();
  for (let t = 0; t < 24 && found.size < sent.length; t++) {
    await sleep(10_000);
    for (const s of sent) if (!found.has(s.messageId)) {
      const r = await findPlacement(inbox, s.messageId).catch((e: unknown) => (console.warn("imap:", String(e).slice(0, 120)), null));
      if (r) found.set(s.messageId, r);
    }
  }
  for (const s of sent) console.log(`PLACEMENT ${s.provider} ${s.from} -> ${TO}: ${found.get(s.messageId)?.folder ?? "NOT FOUND after 4 min"}`);
  if (argv.includes("--no-click")) return;

  const src = [...found.values()][0]?.source ?? "";
  const qp = src.replace(/=\r?\n/g, "").replace(/=3D/g, "=");
  const link = qp.match(/https?:\/\/[^\s"'<>]+\/g\/[A-Za-z0-9_-]+/)?.[0];
  if (!link) throw new Error("no claim link found in the delivered email");
  console.log(`claim link in delivered email: ${link.replace(/\/g\/.*/, "/g/<token>")}`);

  const before = { status: lead.status, clickedAt: lead.clickedAt, viewCount: gift?.viewCount ?? 0, viewedAt: gift?.viewedAt ?? null };
  const req = createRequire(path.resolve(process.cwd(), "../engine/package.json"));
  type Resp = { url(): string; status(): number; text(): Promise<string>; request(): { method(): string } };
  type Page = { waitForResponse(f: (r: Resp) => boolean, o: { timeout: number }): Promise<Resp>; goto(u: string, o: object): Promise<Resp | null>; url(): string; screenshot(o: { path: string }): Promise<unknown> };
  const { chromium } = req("playwright") as { chromium: { launch(): Promise<{ newContext(o: object): Promise<{ newPage(): Promise<Page> }>; close(): Promise<void> }> } };
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } })).newPage();
    const beacon = page.waitForResponse((r) => r.url().includes("/view") && r.request().method() === "POST", { timeout: 45_000 }).catch(() => null);
    const resp = await page.goto(link, { waitUntil: "domcontentloaded", timeout: 45_000 });
    console.log(`landed: ${new URL(page.url()).pathname.replace(/\/gift\/[^/?]+/, "/gift/<token>")} (HTTP ${resp?.status()})`);
    const b = await beacon;
    console.log(`view beacon: ${b ? `${b.status()} ${await b.text()}` : "NOT FIRED"}`);
    await Promise.race([page.screenshot({ path: "/Users/groot/.ezcoder/goals/kly-cold-email/click-check.png" }), sleep(15_000)]).catch(() => undefined);
  } finally {
    await browser.close();
  }
  await sleep(2000);
  const after = await db.outboundLead.findUnique({ where: { id: lead.id }, select: { status: true, clickedAt: true } });
  console.log(`CLICK COUNTED: ${after?.clickedAt ? "yes" : "NO"} (lead status ${after?.status})`);
  // Put the real lead back the way it was (the 2 encore ads it may have started stay for the prospect).
  await db.outboundLead.update({ where: { id: lead.id }, data: { status: before.status, clickedAt: before.clickedAt } });
  if (gift) await db.adsGift.update({ where: { id: gift.id }, data: { viewCount: before.viewCount, viewedAt: before.viewedAt } });
  console.log("restored lead + gift counters");
}

main().then(() => process.exit(0), (e: unknown) => (console.error(e), process.exit(1)));
