import { describe, expect, it } from "vitest";
import { remapToWorkspaceOwners } from "../checkout-recovery";

const c = (userId: string, workspaceId: string | null) => ({ key: `k-${userId}`, billing: "ads" as const, userId, workspaceId, item: { kind: "offer" as const, key: "launch_department" }, startedAt: new Date("2026-11-12T22:33:00Z"), sessionId: null });

describe("remapToWorkspaceOwners", () => {
  it("moves checkouts of deleted users to the workspace owner and leaves others alone", async () => {
    const db = {
      user: { findMany: async () => [{ id: "alive" }] },
      adsWorkspace: { findMany: async () => [{ id: "ws1", ownerId: "owner1" }] },
    };
    const out = await remapToWorkspaceOwners(db, [c("alive", "ws0"), c("gone", "ws1"), c("gone2", null)] as never);
    expect(out.map((x) => x.userId)).toEqual(["alive", "owner1", "gone2"]);
  });
});
