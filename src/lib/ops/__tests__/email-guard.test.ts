// Repo-wide guard: every file that sends email (sendAdsMail / nodemailer sendMail) must be classified. Anything sent to a person
// outside the team needs an unsubscribe mechanism AND a suppression/opt-out check in the same file; adding a new sender fails
// this test until someone classifies it on purpose.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../../..");
function walk(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((f) => {
    if (f === "node_modules" || f === "__tests__" || f === "test") return [];
    const rel = path.join(dir, f);
    return statSync(path.join(root, rel)).isDirectory() ? walk(rel) : /\.tsx?$/.test(f) ? [rel] : [];
  });
}

type Kind = "marketing" | "transport" | "internal" | "transactional" | "known_gap";
const CLASSIFIED: Record<string, { kind: Kind; why: string }> = {
  "src/lib/ads/mailer.ts": { kind: "transport", why: "the SMTP wrapper itself" },
  "engine/src/lifecycle/mail.ts": { kind: "transport", why: "engine SMTP wrapper; callers add List-Unsubscribe" },
  "kly/src/mailboxes.ts": { kind: "transport", why: "mailbox SMTP wrapper; kly/src/sender.ts owns suppression + footer" },
  "kly/src/main.ts": { kind: "internal", why: "health/test sends to the owner" },
  "kly/src/sender.ts": { kind: "marketing", why: "cold email: suppression, unsubscribe, postal address" },
  "src/lib/ads/auto-reply-server.ts": { kind: "marketing", why: "auto-reply to inbound lead" },
  "src/lib/ads/feature-actions.ts": { kind: "marketing", why: "feature emails" },
  "src/lib/ads/leads/server.ts": { kind: "marketing", why: "lead alerts to customers (opt-out)" },
  "src/lib/growth/ad-watch-server.ts": { kind: "marketing", why: "double opt-in ad watch" },
  "src/lib/growth/newsletter-server.ts": { kind: "marketing", why: "double opt-in Ozzy's Ad Report" },
  "src/lib/growth/creative-hubs-server.ts": { kind: "marketing", why: "creative hubs / outreach" },
  "src/app/api/inbound/resend/route.ts": { kind: "marketing", why: "forwards replies; handles unsubscribe keywords" },
  "src/app/api/ads/team/partner-request/route.ts": { kind: "internal", why: "mail to the owner" },
  "src/app/api/cron/funnel-monitor/route.ts": { kind: "internal", why: "owner digest" },
  "src/app/api/cron/growth-review/route.ts": { kind: "internal", why: "owner digest" },
  "src/app/api/cron/ops-watchdog/route.ts": { kind: "internal", why: "owner incident alert" },
  "src/app/api/cron/revenue-digest/route.ts": { kind: "internal", why: "owner digest" },
  "src/app/api/cron/scoreboard-digest/route.ts": { kind: "internal", why: "owner digest" },
  "src/lib/ads/founder-alert.ts": { kind: "internal", why: "alerts to the owner" },
  "src/lib/ads/payment-alert.ts": { kind: "internal", why: "payment alert to the owner" },
  "src/lib/notifications.ts": { kind: "transactional", why: "testimonial video-ready notices to the account holder" },
  "src/lib/ads/verify.ts": { kind: "transactional", why: "email verification code the user asked for" },
  "src/lib/ads/partner-admin.ts": { kind: "transactional", why: "partner onboarding to the partner who applied" },
  "src/lib/studio/invite-server.ts": { kind: "marketing", why: "S-09 fixed: referral invite checks OutboundSuppression, 5/day cap, contact ledger, opt-out note (reply unsubscribe)" },
};

describe("email senders", () => {
  const callers = [...walk("src"), ...walk("engine/src"), ...walk("kly/src")].filter((f) => /\b(sendAdsMail|sendMail)\(/.test(readFileSync(path.join(root, f), "utf8")));
  it("every sender file is classified", () => {
    expect(callers.filter((f) => !CLASSIFIED[f])).toEqual([]);
    expect(Object.keys(CLASSIFIED).filter((f) => !callers.includes(f))).toEqual([]);
  });
  it("marketing senders check suppression and carry an unsubscribe mechanism", () => {
    for (const [f, c] of Object.entries(CLASSIFIED).filter(([, c]) => c.kind === "marketing")) {
      const s = readFileSync(path.join(root, f), "utf8");
      expect(/unsubscribe|opt[-_ ]?out|STOP/i.test(s), `${f} unsubscribe`).toBe(true);
      expect(/suppress|opt[-_ ]?out|unsubscribed|isOptedOut/i.test(s), `${f} suppression`).toBe(true);
    }
  });
  it("lifecycle (engine) path attaches List-Unsubscribe headers and checks suppression", () => {
    const s = readFileSync(path.join(root, "engine/src/lifecycle/send.ts"), "utf8");
    expect(s).toMatch(/unsubscribeHeaders\(/);
    expect(s).toMatch(/suppress|unsubscribed/i);
  });
  it("cold email gets the postal address from OUTBOUND_POSTAL_ADDRESS (with the default only as documented fallback)", () => {
    const s = readFileSync(path.join(root, "kly/src/sender.ts"), "utf8");
    expect(s).toContain("OUTBOUND_POSTAL_ADDRESS");
    expect(s).toMatch(/OutboundSuppression|suppress/i);
  });
  it("studio invite checks suppression, a daily cap and the contact guard (S-09)", () => {
    const s = readFileSync(path.join(root, "src/lib/studio/invite-server.ts"), "utf8");
    expect(s).toMatch(/outboundSuppression/);
    expect(s).toMatch(/rateLimit\(`studio_invite_mail/);
    expect(s).toMatch(/guardContact/);
  });
});
