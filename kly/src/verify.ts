// Our own email checker (owner decision 2026-11-13: no paid verifier). Asks the address's own mail server whether the
// mailbox exists (EHLO / MAIL FROM / RCPT TO, then QUIT: nothing is ever sent), then probes a random address on the
// same domain to spot catch-all servers. Reply parsing follows reacherhq/check-if-email-exists (core/src/smtp/parser.rs).
// Runs from Kly's Railway IP, never from the Maildoso IPs we send from, so checks can't hurt sending reputation.
// Leads: emailCheck valid | catch_all | unknown -> may be sent; invalid -> failed (never sent); retry -> checked again.
import { promises as dns } from "node:dns";
import net from "node:net";
import { randomBytes } from "node:crypto";
import type { Db } from "./db";
import { errMsg, log } from "./log";

export type EmailCheck = "valid" | "invalid" | "catch_all" | "unknown";
export type RcptVerdict = "ok" | "invalid" | "temp" | "blocked";

export const VERIFY_PER_TICK = 30;
export const VERIFY_CONCURRENCY = 5;
export const VERIFY_TIMEOUT_MS = 20_000;
export const RETRY_AFTER_MS = 45 * 60_000;
export const BLOCKED_PAUSE_MS = 60 * 60_000;
/** Statuses whose email may still be sent (step 0 only: follow-ups were already checked by their first send). */
const CHECKABLE = ["found", "ad_made", "queued"];

export function verifyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.KLY_VERIFY_EMAILS ?? "on").toLowerCase() !== "off";
}

/** Pure: what one RCPT reply means (greylisting first: those replies also say "address rejected"). */
export function classifyRcpt(code: number, text: string): RcptVerdict {
  if (code === 250 || code === 251) return "ok";
  const t = text.toLowerCase();
  if (/greylist|graylist|grey-list|gray-list|postgrey/.test(t)) return "temp";
  // Refusals of OUR IP (no reverse DNS, block lists) often also say "recipient address rejected": check them first.
  if (/5\.7\.25|reverse dns|reverse hostname|\bptr\b|client host|blocked using|spamhaus|your ip|connection rejected/.test(t)) return "blocked";
  // 4xx is temporary by definition: never call an address dead on a 4xx.
  if (code >= 400 && code < 500) return /blacklist|black list|block ?list|blocked|dnsbl|banned|access denied/.test(t) ? "blocked" : "temp";
  // "Receiving mail at a rate that..." means the mailbox exists.
  if (t.includes("receiving mail at a rate")) return "ok";
  if (/mailbox full|quota exceeded|over quota|out of storage space|exceeded storage allocation|too many messages|insufficient/.test(t)) return "invalid";
  if (/account .*disabled|is disabled|discontinued|mailbox is inactive/.test(t)) return "invalid";
  if (/address rejected|unrouteable|does not exist|doesn't exist|dosn't exist|invalid (email )?address|invalid recipient|recipient invalid|may not exist|recipient rejected|unknown recipient|undeliverable|user unknown|unknown user|recipient unknown|no such (user|mailbox|recipient|person)|mailbox not found|invalid mailbox|no mailbox|mailbox unavailable|mailbox is unavailable|not a valid mailbox|have an account|unknown local part|no longer available|could not be found|address error|address is not handled|recipient is not exist|recipient not found|verify address failed|unable to verify user|no mail-enabled subscriptions/.test(t)) return "invalid";
  if (/blacklist|black list|block ?list|blocked|spamhaus|abusix|dnsbl|poor reputation|junkmail|banned|relaying denied|access denied|administratively denied|connection rejected|not yet authorized|reverse (dns|hostname)|sbrs score|proofpoint|\bspam\b/.test(t)) return "blocked";
  if (code >= 500 && /\b5\.1\.\d\b/.test(t)) return "invalid";
  return "temp";
}

/** Pure: the address's verdict from the target reply and the random-address (catch-all) reply. */
export function verdictOf(target: RcptVerdict, random: RcptVerdict | null): EmailCheck | "retry" | "blocked" {
  if (target === "invalid") return "invalid";
  if (target === "blocked") return "blocked";
  if (target === "temp") return "retry";
  return random === "ok" ? "catch_all" : "valid";
}

interface Reply { code: number; text: string }

/** Minimal SMTP client: one connection, reply lines collected until the final "NNN " line. */
async function smtpSession(host: string, steps: (send: (line: string) => Promise<Reply>) => Promise<void>, timeoutMs: number): Promise<void> {
  const sock = net.connect({ host, port: 25 });
  sock.setEncoding("utf8");
  let buf = "";
  const lines: string[] = [];
  let waiter: ((r: Reply) => void) | null = null;
  let failer: ((e: Error) => void) | null = null;
  const flush = () => {
    const i = lines.findIndex((l) => /^\d{3} /.test(l) || /^\d{3}$/.test(l));
    if (i < 0 || !waiter) return;
    const got = lines.splice(0, i + 1);
    const w = waiter;
    waiter = null;
    w({ code: Number(got[got.length - 1]!.slice(0, 3)), text: got.map((l) => l.slice(4)).join(" ") });
  };
  sock.on("data", (d: string) => {
    buf += d;
    let k: number;
    while ((k = buf.indexOf("\n")) >= 0) {
      lines.push(buf.slice(0, k).replace(/\r$/, ""));
      buf = buf.slice(k + 1);
    }
    flush();
  });
  const timer = setTimeout(() => sock.destroy(new Error("smtp timeout")), timeoutMs);
  sock.on("error", (e) => failer?.(e));
  sock.on("close", () => failer?.(new Error("smtp connection closed")));
  const next = () => new Promise<Reply>((res, rej) => { waiter = res; failer = rej; flush(); });
  try {
    await new Promise<void>((res, rej) => { sock.once("connect", res); sock.once("error", rej); });
    const greet = await next();
    if (greet.code !== 220) throw new Error(`greeting ${greet.code} ${greet.text.slice(0, 120)}`);
    await steps(async (line) => {
      sock.write(`${line}\r\n`);
      return next();
    });
  } finally {
    clearTimeout(timer);
    failer = null;
    if (!sock.destroyed) {
      sock.write("QUIT\r\n");
      sock.end();
    }
  }
}

export interface CheckOptions {
  helo?: string;
  from?: string;
  timeoutMs?: number;
  resolveMx?: (domain: string) => Promise<Array<{ exchange: string; priority: number }>>;
  /** Providers (mxProvider) to answer "unknown" for without connecting. */
  skip?: (provider: string) => boolean;
}

/** Check one address. "blocked" = the server refused us (our IP), not the address: treat as unknown and back off. */
export async function checkEmail(email: string, o: CheckOptions = {}): Promise<{ result: EmailCheck | "retry" | "blocked" | "skipped"; detail: string; provider?: string }> {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (!domain) return { result: "invalid", detail: "no domain" };
  const mx = await (o.resolveMx ?? dns.resolveMx)(domain).catch(() => []);
  const host = mx.sort((a, b) => a.priority - b.priority)[0]?.exchange;
  if (!host) return { result: "invalid", detail: "no MX" };
  const provider = mxProvider(host);
  if (o.skip?.(provider)) return { result: "skipped", detail: `${provider} refuses checks from our IP`, provider };
  const helo = o.helo ?? process.env.KLY_VERIFY_HELO ?? "verify.komendly.com";
  const from = o.from ?? process.env.KLY_VERIFY_FROM ?? "verify@komendly.com";
  let target: Reply | null = null;
  let random: Reply | null = null;
  try {
  await smtpSession(host, async (send) => {
    let r = await send(`EHLO ${helo}`);
    if (r.code !== 250) r = await send(`HELO ${helo}`);
    if (r.code !== 250) throw new Error(`helo ${r.code} ${r.text.slice(0, 120)}`);
    r = await send(`MAIL FROM:<${from}>`);
    // MAIL FROM refused = the server refuses us, not the address.
    if (r.code !== 250) throw Object.assign(new Error(`mail from ${r.code} ${r.text.slice(0, 120)}`), { refused: true });
    target = await send(`RCPT TO:<${email}>`);
    if (classifyRcpt(target.code, target.text) === "ok") random = await send(`RCPT TO:<${randomBytes(8).toString("hex")}x@${domain}>`).catch(() => null);
  }, o.timeoutMs ?? VERIFY_TIMEOUT_MS);
  } catch (e) {
    if ((e as { refused?: boolean }).refused) return { result: "blocked", detail: `${host} ${errMsg(e)}`.slice(0, 200), provider };
    throw e;
  }
  const t = target as Reply | null;
  const rr = random as Reply | null;
  if (!t) return { result: "retry", detail: "no reply", provider };
  const result = verdictOf(classifyRcpt(t.code, t.text), rr ? classifyRcpt(rr.code, rr.text) : null);
  return { result, detail: `${host} ${t.code} ${t.text}`.slice(0, 200), provider };
}

/** Mail provider of an MX host ("protection.outlook.com", "google.com", "hostedemail.com"): refusals are per provider. */
export function mxProvider(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (h.endsWith(".protection.outlook.com")) return "protection.outlook.com";
  return h.split(".").slice(-2).join(".");
}

/** Refusing providers are skipped (result "unknown", no connection) until `until`; Google refusing pauses everything. */
export interface VerifyRuntime { pausedUntil: number; skip: Map<string, number> }
export const createVerifyRuntime = (): VerifyRuntime => ({ pausedUntil: 0, skip: new Map() });
export const PROVIDER_SKIP_MS = 6 * 3600_000;

/** Loop step: check up to VERIFY_PER_TICK unchecked (or due-for-retry) leads, next-to-send first. */
export async function verifyTick(db: Db, rt: VerifyRuntime, now: Date, check: typeof checkEmail = checkEmail): Promise<{ checked: number; invalid: number; counts: Record<string, number> } | null> {
  if (Date.now() < rt.pausedUntil) return null;
  const base = { purgedAt: null, email: { not: "" }, step: 0, status: { in: CHECKABLE } };
  const leads = await db.outboundLead.findMany({
    where: { ...base, OR: [{ emailCheck: null }, { emailCheck: "retry", emailCheckedAt: { lt: new Date(now.getTime() - RETRY_AFTER_MS) } }] },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }], // ad_made < found < queued: gifted leads (sent soonest) first
    select: { id: true, email: true, emailCheck: true },
    take: VERIFY_PER_TICK,
  });
  if (!leads.length) return null;
  const counts: Record<string, number> = {};
  let blocked = 0;
  let invalid = 0;
  const queue = [...leads];
  const worker = async () => {
    for (let l = queue.shift(); l; l = queue.shift()) {
      let r: Awaited<ReturnType<typeof checkEmail>>;
      try {
        r = await check(l.email, { skip: (p) => (rt.skip.get(p) ?? 0) > Date.now() });
      } catch (e) {
        r = { result: "retry", detail: errMsg(e).slice(0, 200) };
      }
      if (r.result === "blocked" && r.provider) {
        rt.skip.set(r.provider, Date.now() + PROVIDER_SKIP_MS);
        if (r.provider === "google.com") blocked++;
      }
      // Temporary trouble twice, or the provider refuses our IP -> "unknown": sendable, like a paid verifier's "unknown".
      const final: string = r.result === "blocked" || r.result === "skipped" ? "unknown" : r.result === "retry" ? (l.emailCheck === "retry" ? "unknown" : "retry") : r.result;
      counts[final] = (counts[final] ?? 0) + 1;
      if (final === "invalid") {
        invalid++;
        await db.outboundLead.update({ where: { id: l.id }, data: { emailCheck: final, emailCheckedAt: now, status: "failed", error: `email check: ${r.detail}`.slice(0, 300) } });
      } else {
        await db.outboundLead.update({ where: { id: l.id }, data: { emailCheck: final, emailCheckedAt: now } });
      }
    }
  };
  await Promise.all(Array.from({ length: VERIFY_CONCURRENCY }, worker));
  if (blocked >= 2) {
    rt.pausedUntil = Date.now() + BLOCKED_PAUSE_MS;
    log("warn", "kly email check: Google refusing our checks, pausing 1h", { blocked });
  }
  return { checked: leads.length, invalid, counts };
}
