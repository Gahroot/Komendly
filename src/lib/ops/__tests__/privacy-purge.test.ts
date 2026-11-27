import { describe, expect, it } from "vitest";
import { anonEmail, buildPurgePlan, RETAINED } from "../security/privacy-purge";

describe("privacy purge plan", () => {
  const plan = buildPurgePlan({ userId: "u1", email: "Bob@Example.com", workspaceIds: ["w1"] });
  it("anonymises deterministically and never leaves the address", () => {
    expect(anonEmail("Bob@Example.com", "u1")).toBe(anonEmail("bob@example.com", "u1"));
    expect(anonEmail("bob@example.com", "u1")).toMatch(/@deleted\.invalid$/);
    expect(JSON.stringify(plan.find((s) => s.id === "user")?.set)).not.toMatch(/bob/i);
  });
  it("covers sessions, keys, cold email, events, suppression and the user row", () => {
    const ids = plan.map((s) => s.id);
    for (const id of ["sessions", "agent_keys", "outbound_leads", "outbound_sends", "events_by_user", "events_by_email", "suppress", "user"]) expect(ids).toContain(id);
  });
  it("matches by lower-cased email", () => expect(plan.find((s) => s.id === "outbound_leads")?.where).toEqual({ email: "bob@example.com" }));
  it("customer content deletion is opt-in and financial records are retained", () => {
    expect(plan.filter((s) => s.optIn).map((s) => s.id)).toEqual(["content", "content_fal", "content_reviews"]);
    expect(RETAINED.join()).toMatch(/CreditPurchase/);
  });
});
