import { describe, expect, it } from "vitest";
import { decideInviteClaim, decideSenderReward, isPlausibleInviteToken, utcMonthStart, type InviteClaimInput } from "../invite";

function input(over: Partial<InviteClaimInput> = {}): InviteClaimInput {
  return {
    inviteStatus: "sent", senderUserId: "u1", senderWorkspaceId: "w1", senderEmail: "a@x.com", senderNetwork: "n1",
    friendUserId: "u2", friendWorkspaceId: "w2", friendEmail: "b@y.com", friendNetwork: "n2", friendIsNew: true, friendFreeVideos: 1,
    ...over,
  };
}

describe("decideInviteClaim", () => {
  it("gives a new friend max(2, current) free videos", () => {
    expect(decideInviteClaim(input())).toEqual({ ok: true, friendFreeVideos: 2 });
    expect(decideInviteClaim(input({ friendFreeVideos: 3 }))).toEqual({ ok: true, friendFreeVideos: 3 });
  });
  it("rejects self invites by user, workspace or email", () => {
    expect(decideInviteClaim(input({ friendUserId: "u1" }))).toEqual({ ok: false, reason: "self" });
    expect(decideInviteClaim(input({ friendWorkspaceId: "w1" }))).toEqual({ ok: false, reason: "self" });
    expect(decideInviteClaim(input({ friendEmail: "a@x.com" }))).toEqual({ ok: false, reason: "self" });
  });
  it("rejects the same network but ignores unknown networks", () => {
    expect(decideInviteClaim(input({ friendNetwork: "n1" }))).toEqual({ ok: false, reason: "same_network" });
    expect(decideInviteClaim(input({ senderNetwork: null, friendNetwork: "n1" })).ok).toBe(true);
  });
  it("is idempotent: a used invite or an existing user never claims", () => {
    expect(decideInviteClaim(input({ inviteStatus: "claimed" }))).toEqual({ ok: false, reason: "already_claimed" });
    expect(decideInviteClaim(input({ friendIsNew: false }))).toEqual({ ok: false, reason: "existing_user" });
  });
});

describe("decideSenderReward", () => {
  it("rewards a claimed invite under the monthly cap", () => {
    expect(decideSenderReward({ inviteStatus: "claimed", rewardsThisMonth: 4 })).toEqual({ reward: true, videos: 1 });
  });
  it("caps at 5 per month and never rewards twice", () => {
    expect(decideSenderReward({ inviteStatus: "claimed", rewardsThisMonth: 5 })).toEqual({ reward: false, reason: "monthly_cap" });
    expect(decideSenderReward({ inviteStatus: "rewarded", rewardsThisMonth: 0 })).toEqual({ reward: false, reason: "not_claimed" });
  });
});

describe("helpers", () => {
  it("month start is UTC", () => {
    expect(utcMonthStart(new Date("2026-11-10T23:30:00-05:00")).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
  it("token shape", () => {
    expect(isPlausibleInviteToken("abcDEF123_-xyz789")).toBe(true);
    expect(isPlausibleInviteToken("short")).toBe(false);
    expect(isPlausibleInviteToken("../../etc/passwd/aaaaaaa")).toBe(false);
  });
});
