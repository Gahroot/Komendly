import { describe, expect, it } from "vitest";
import { kbAnswer, KB } from "../kb";
import { recommendRefund } from "../refund";
import { buildTickets, fixLink, groupByStatus, slaState, supportHealth } from "../support";

const t0 = new Date("2026-11-26T12:00:00Z");
const min = (n: number) => new Date(t0.getTime() + n * 60_000);

describe("kbAnswer", () => {
  it("answers the common questions", () => {
    expect(kbAnswer("I can't download my ads")?.id).toBe("download");
    expect(kbAnswer("how do I unlock the rest of the pack?")?.id).toBe("locked");
    expect(kbAnswer("I want a refund")?.id).toBe("refund");
    expect(kbAnswer("how do I cancel my subscription")?.id).toBe("cancel");
    expect(kbAnswer("how do I connect my facebook ad account")?.id).toBe("meta_setup");
  });
  it("returns null for unrelated text and never promises results", () => {
    expect(kbAnswer("hello there")).toBeNull();
    expect(kbAnswer("")).toBeNull();
    for (const e of KB) expect(e.answer).not.toMatch(/guaranteed (leads|sales|results)|will get you/i);
  });
  it("answers fit the auto-reply length cap", () => { for (const e of KB) expect(e.answer.length).toBeLessThanOrEqual(600); });
  it("states the 30-day guarantee", () => expect(KB.find((e) => e.id === "refund")!.answer).toContain("30-day"));
});

describe("tickets and SLA", () => {
  const reply = (id: string, at: Date) => ({ emailId: id, at, from: "a@b.com", subject: "s", text: "t", userId: null, workspaceId: null });
  it("derives statuses", () => {
    const tk = buildTickets({
      replies: [reply("a", min(0)), reply("b", min(0)), reply("c", min(0)), reply("d", min(0)), reply("e", min(0))],
      autoReplied: [{ emailId: "a", at: min(1), category: "how_to" }, { emailId: "b", at: min(2), category: "support_problem" }],
      needsHuman: [{ emailId: "c", at: min(0), category: "refund_request", paying: true, refundEligible: true }, { emailId: "e", at: min(0), category: "angry_legal", paying: false, refundEligible: null }],
      handled: [{ emailId: "e", at: min(5) }], failedJobs: [{ jobId: "j", at: min(0), type: "render_static", cause: "x", userId: null, workspaceId: null, resolved: false }],
    }, min(60));
    const g = groupByStatus(tk);
    expect(g.auto_resolved.map((x) => x.id)).toEqual(["reply:a"]);
    expect(g.waiting_customer.map((x) => x.id)).toEqual(["reply:b"]);
    expect(g.needs_owner.map((x) => x.id)).toEqual(["reply:c"]);
    expect(g.resolved.map((x) => x.id)).toEqual(["reply:e"]);
    expect(g.new.map((x) => x.id).sort()).toEqual(["job:j", "reply:d"]);
    expect(g.needs_owner[0].ownerOverdue).toBe(false); // due after 4h, only 60 min in
  });
  it("owner due is 4h for paying", () => {
    const [t] = buildTickets({ replies: [reply("c", min(0))], autoReplied: [], needsHuman: [{ emailId: "c", at: min(0), category: "billing", paying: true, refundEligible: null }], handled: [], failedJobs: [] }, min(300));
    expect(t.ownerOverdue).toBe(true);
    const [u] = buildTickets({ replies: [reply("c", min(0))], autoReplied: [], needsHuman: [{ emailId: "c", at: min(0), category: "billing", paying: true, refundEligible: null }], handled: [], failedJobs: [] }, min(60));
    expect(u.ownerOverdue).toBe(false);
  });
  it("SLA: 15 minutes", () => {
    expect(slaState(min(0), min(14), min(60))).toBe("met");
    expect(slaState(min(0), min(16), min(60))).toBe("breached");
    expect(slaState(min(0), null, min(10))).toBe("pending");
    expect(slaState(min(0), null, min(20))).toBe("breached");
  });
  it("health: responder silent only when nothing has an outcome", () => {
    const mk = (n: number) => buildTickets({ replies: Array.from({ length: n }, (_, i) => reply(`r${i}`, min(0))), autoReplied: [], needsHuman: [], handled: [], failedJobs: [] }, min(60));
    expect(supportHealth(mk(4), min(60))).toMatchObject({ unanswered: 4, withOutcome: 0 });
  });
  it("fix links", () => expect(fixLink("download_failed").href).toBe("/admin/ads/jobs"));
});

describe("recommendRefund", () => {
  const now = new Date("2026-11-26T00:00:00Z");
  const paid = (daysAgo: number) => ({ amountCents: 9700, at: new Date(now.getTime() - daysAgo * 86_400_000) });
  const base = { subscriptionLive: true, workspaceRefunds: 0, failedJobs: 0, downloaded: false, now };
  it("recommends within 30 days", () => expect(recommendRefund({ ...base, firstPaid: paid(5) }).verdict).toBe("recommend_refund"));
  it("declines outside the window with no failures", () => expect(recommendRefund({ ...base, firstPaid: paid(45) }).verdict).toBe("recommend_decline"));
  it("owner decides outside window with our failures", () => expect(recommendRefund({ ...base, firstPaid: paid(45), failedJobs: 2 }).verdict).toBe("owner_decides"));
  it("owner decides on repeat refund", () => expect(recommendRefund({ ...base, firstPaid: paid(2), workspaceRefunds: 1 }).verdict).toBe("owner_decides"));
  it("declines with no payment", () => expect(recommendRefund({ ...base, firstPaid: null }).verdict).toBe("recommend_decline"));
});
