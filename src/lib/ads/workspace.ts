import type { AdsWorkspace, User } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Expected, user-facing API failure. Routes turn it into JSON via `adsErrorResponse`. */
export class AdsHttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function adsErrorResponse(error: unknown): NextResponse {
  if (error instanceof AdsHttpError) {
    return NextResponse.json({ error: error.message, code: error.code, ...error.extra }, { status: error.status });
  }
  console.error("[ads] unexpected error", error);
  return NextResponse.json({ error: "Something went wrong. Please try again.", code: "internal" }, { status: 500 });
}

/** Signed-in user or 401. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AdsHttpError(401, "unauthenticated", "Please sign in to continue.");
  return user;
}

function workspaceNameFor(user: User): string {
  return user.name ? `${user.name}'s workspace` : user.email.split("@")[0] ?? "My workspace";
}

/** The user's primary workspace; created (with owner membership) on first use. */
export async function getOrCreateWorkspace(user: User): Promise<AdsWorkspace> {
  const membership = await prisma.adsWorkspaceMember.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: { workspace: true },
  });
  if (membership) return membership.workspace;
  return prisma.$transaction(async (tx) => {
    const again = await tx.adsWorkspaceMember.findFirst({ where: { userId: user.id }, include: { workspace: true } });
    if (again) return again.workspace;
    return tx.adsWorkspace.create({
      data: {
        name: workspaceNameFor(user),
        ownerId: user.id,
        members: { create: { userId: user.id, role: "owner" } },
      },
    });
  });
}

export interface WorkspaceAccess {
  user: User;
  workspace: AdsWorkspace;
  role: string;
}

/**
 * Multi-tenant guard: resolves the workspace from a run, brand profile, ad asset or
 * workspace id (never trusting the client) and asserts the signed-in user is a member.
 * Unknown and foreign resources both yield 404 so ids can't be probed.
 */
export async function requireWorkspaceMember(
  target: { runId: string } | { workspaceId: string } | { brandProfileId: string } | { assetId: string },
): Promise<WorkspaceAccess> {
  const user = await requireUser();
  let workspaceId: string | null = null;
  if ("workspaceId" in target) workspaceId = target.workspaceId;
  else if ("runId" in target) {
    workspaceId = (await prisma.adRun.findUnique({ where: { id: target.runId }, select: { workspaceId: true } }))?.workspaceId ?? null;
  } else if ("brandProfileId" in target) {
    workspaceId =
      (await prisma.brandProfile.findUnique({ where: { id: target.brandProfileId }, select: { workspaceId: true } }))?.workspaceId ?? null;
  } else {
    const asset = await prisma.adAsset.findUnique({ where: { id: target.assetId }, select: { ad: { select: { workspaceId: true } } } });
    workspaceId = asset?.ad.workspaceId ?? null;
  }
  if (!workspaceId) throw new AdsHttpError(404, "not_found", "Not found.");
  const member = await prisma.adsWorkspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    include: { workspace: true },
  });
  if (!member) throw new AdsHttpError(404, "not_found", "Not found.");
  return { user, workspace: member.workspace, role: member.role };
}

export { isPaidWorkspace } from "./billing-gates";
