// Web glue for instant lead alerts: Prisma + the stored Meta token + SMTP. Used by /api/meta-webhooks/leadgen.
import { prisma } from "@/lib/prisma";
import { appBaseUrl, sendAdsMail } from "@/lib/ads/mailer";
import { loadMetaToken } from "@/lib/ads/meta/connection";
import { graphVersion } from "@/lib/ads/meta/config";
import { signEmailToken } from "@/lib/ads/lifecycle/tokens";
import { fetchLead, LEAD_ALERTED_EVENT, pageAccessToken, type LeadAlertDeps, type LeadOwner } from "./alert";

const fetcher = (u: string, init?: RequestInit) => fetch(u, { ...init, cache: "no-store" });

export function leadAlertDeps(origin: string): LeadAlertDeps {
  const appUrl = appBaseUrl(origin);
  return {
    appUrl,
    async ownerForPage(pageId) {
      const conns = await prisma.metaConnection.findMany({ where: { pageId }, orderBy: { updatedAt: "desc" }, take: 5, select: { workspaceId: true, workspace: { select: { ownerId: true, name: true, suspendedAt: true } } } });
      for (const c of conns) {
        if (c.workspace.suspendedAt) continue;
        const user = await prisma.user.findUnique({ where: { id: c.workspace.ownerId }, select: { email: true } });
        if (!user?.email) continue;
        const token = await loadMetaToken(c.workspaceId).catch(() => null);
        if (!token) continue;
        const brand = await prisma.brandProfile.findFirst({ where: { workspaceId: c.workspaceId, name: { not: null } }, orderBy: { createdAt: "desc" }, select: { name: true } }).catch(() => null);
        return { workspaceId: c.workspaceId, userId: c.workspace.ownerId, email: user.email, businessName: brand?.name ?? null, userToken: token.accessToken } satisfies LeadOwner;
      }
      return null;
    },
    async optedOut(userId) {
      return Boolean(await prisma.adsEvent.findFirst({ where: { name: "email_unsubscribed", userId }, select: { id: true } }));
    },
    async claim(leadgenId, owner, change) {
      return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`meta_lead:${leadgenId}`}))`;
        const prior = await tx.adsEvent.findFirst({ where: { name: LEAD_ALERTED_EVENT, props: { path: ["leadgenId"], equals: leadgenId } }, select: { id: true } });
        if (prior) return null;
        const ev = await tx.adsEvent.create({ data: { name: LEAD_ALERTED_EVENT, workspaceId: owner.workspaceId, userId: owner.userId, props: { leadgenId, pageId: change.pageId, formId: change.formId, adId: change.adId } } });
        return ev.id;
      });
    },
    async release(claimId) {
      await prisma.adsEvent.delete({ where: { id: claimId } });
    },
    async getLead(owner, change) {
      const v = graphVersion();
      const pageToken = await pageAccessToken(fetcher, { userToken: owner.userToken, pageId: change.pageId, graphVersion: v });
      return fetchLead(fetcher, { pageToken, leadgenId: change.leadgenId, graphVersion: v });
    },
    unsubscribeUrl(userId) {
      const secret = process.env.LIFECYCLE_EMAIL_SECRET;
      return secret ? `${appUrl}/api/ads/email-unsubscribe?t=${signEmailToken({ p: "unsub", u: userId }, secret)}` : null;
    },
    async send(m) {
      await sendAdsMail(m);
    },
  };
}
