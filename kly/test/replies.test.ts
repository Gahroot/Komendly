import { describe, expect, it } from "vitest";
import { handleReply, MAX_AUTO_REPLIES, planReply } from "../src/replies";
import { outboundEnv } from "../src/sender";
import { fakeDb, scriptedProvider } from "./fakes";

describe("planReply", () => {
  const p = { autoReply: true, autoReplies: 0, canSend: true };
  it("auto-replies to interested/question up to the limit, then alerts", () => {
    expect(MAX_AUTO_REPLIES).toBe(2);
    expect(planReply({ ...p, intent: "interested" })).toBe("auto_reply");
    expect(planReply({ ...p, intent: "question", autoReplies: 1 })).toBe("auto_reply");
    expect(planReply({ ...p, intent: "question", autoReplies: 2 })).toBe("alert");
    expect(planReply({ ...p, intent: "interested", autoReply: false })).toBe("alert");
    expect(planReply({ ...p, intent: "interested", canSend: false })).toBe("alert");
  });
  it("suppresses on unsubscribe/not_interested, ignores auto replies", () => {
    expect(planReply({ ...p, intent: "unsubscribe" })).toBe("suppress");
    expect(planReply({ ...p, intent: "not_interested" })).toBe("suppress");
    expect(planReply({ ...p, intent: "auto_reply" })).toBe("ignore");
    expect(planReply({ ...p, intent: "not_now" })).toBe("note");
  });
});

const lead = { id: "L1", email: "owner@acme.com", domain: "acme.com", businessName: "Acme", website: "https://acme.com", status: "sent", repliedAt: null, claimToken: "c", unsubToken: "u" };
const c = { kind: "reply" as const, refs: [], failedRecipient: null, fromAddress: "owner@acme.com", subject: "Re: made an ad", snippet: "please stop" };
const mailbox = { address: "ozzy@getkomendly.com", name: "Ozzy", user: "ozzy@getkomendly.com", appPassword: "x", smtpHost: "s", smtpPort: 465, imapHost: "i", imapPort: 993 };

function deps(intent: string, autoReplies: number, answers: unknown[] = []) {
  const f = fakeDb({ outboundSend: { count: () => autoReplies } });
  const alerts: string[] = [];
  const sent: string[] = [];
  const d = {
    db: f.db,
    provider: scriptedProvider([{ intent }, ...answers]),
    alert: async (s: string) => void alerts.push(s),
    autoReply: true,
    cfg: outboundEnv({}),
    mailbox: mailbox as never,
    transport: () => async (m: { text: string }) => void sent.push(m.text),
  };
  return { f, d, alerts, sent };
}

describe("handleReply", () => {
  it("suppresses email + domain on not_interested", async () => {
    const { f, d } = deps("not_interested", 0);
    expect(await handleReply(d, { lead: lead as never, sendId: "S1", mailboxId: "M1", c, inboundMessageId: null })).toBe("suppressed (not_interested)");
    expect(f.of("outboundSuppression", "upsert").map((a) => (a as { where: { value: string } }).where.value).sort()).toEqual(["acme.com", "owner@acme.com"]);
    expect(f.of("outboundLead", "update")).toContainEqual(expect.objectContaining({ data: expect.objectContaining({ status: "unsubscribed" }) }));
  });
  it("auto-replies to an interested prospect under the limit", async () => {
    const { d, sent, alerts } = deps("interested", 1, [{ answer: "Yes, it is free to claim and use.", confident: true }]);
    expect(await handleReply(d, { lead: lead as never, sendId: "S1", mailboxId: "M1", c: { ...c, snippet: "is it free?" }, inboundMessageId: "<a@b>" })).toBe("auto-replied (interested)");
    expect(sent).toHaveLength(1);
    expect(alerts).toHaveLength(0);
  });
  it("alerts the founder once the auto-reply limit is hit", async () => {
    const { d, sent, alerts } = deps("question", 2);
    expect(await handleReply(d, { lead: lead as never, sendId: "S1", mailboxId: "M1", c, inboundMessageId: null })).toBe("alerted (question)");
    expect(sent).toHaveLength(0);
    expect(alerts).toHaveLength(1);
  });
});
