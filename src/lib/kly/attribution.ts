// At ads signup: link the Kly lead whose claim link set kmd_kly. Never throws (signup must not fail).
import { prisma } from "@/lib/prisma";
import { isKlyClaimToken, klySignupUpdate } from "./claim";

export async function linkKlyLeadAtSignup(token: string | null | undefined, ctx: { userId: string; workspaceId: string; now?: Date }): Promise<string | null> {
  try {
    if (!isKlyClaimToken(token)) return null;
    const lead = await prisma.outboundLead.findUnique({ where: { claimToken: token }, select: { id: true, status: true, userId: true } });
    if (!lead) return null;
    const data = klySignupUpdate(lead, { userId: ctx.userId, workspaceId: ctx.workspaceId, now: ctx.now ?? new Date() });
    if (!data) return null;
    await prisma.outboundLead.update({ where: { id: lead.id }, data });
    return lead.id;
  } catch (error) {
    console.error("[kly] signup attribution failed", error);
    return null;
  }
}
