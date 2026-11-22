// Web glue for instant lead alerts / the team's Lead Desk: Prisma + the stored Meta token + SMTP.
// Used by /api/meta-webhooks/leadgen. Page -> MarketingMandate first (lead goes to mandate.leadEmail), else the
// workspace whose MetaConnection uses the page (lead goes to the owner).
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appBaseUrl, sendAdsMail } from "@/lib/ads/mailer";
import { loadMetaToken } from "@/lib/ads/meta/connection";
import { graphVersion } from "@/lib/ads/meta/config";
import { signEmailToken } from "@/lib/ads/lifecycle/tokens";
import { TEAM_EVENTS } from "@/lib/ads/team/contracts";
import { fetchLead, LEAD_ALERTED_EVENT, leadActionKey, pageAccessToken, type LeadAlertDeps, type LeadOwner } from "./alert";

const fetcher = (u: string, init?: RequestInit) => fetch(u, { ...init, cache: "no-store" });
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

async function ownerFor(workspaceId: string, leadEmail: string | null): Promise<LeadOwner | null> {
  const ws = await prisma.adsWorkspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true, suspendedAt: true } });
  if (!ws || ws.suspendedAt) return null;
  const user = await prisma.user.findUnique({ where: { id: ws.ownerId }, select: { email: true } });
  const email = leadEmail || user?.email;
  if (!email) return null;
  const token = await loadMetaToken(workspaceId).catch(() => null);
  if (!token) return null;
  const brand = await prisma.brandProfile.findFirst({ where: { workspaceId, name: { not: null } }, orderBy: { createdAt: "desc" }, select: { name: true } }).catch(() => null);
  return { workspaceId, userId: ws.ownerId, email, businessName: brand?.name ?? null, userToken: token.accessToken, mandate: leadEmail !== null };
}

export function leadAlertDeps(origin: string): LeadAlertDeps {
  const appUrl = appBaseUrl(origin);
  return {
    appUrl,
    async ownerForPage(pageId) {
      const mandates = await prisma.marketingMandate.findMany({ where: { pageId }, orderBy: { updatedAt: "desc" }, take: 5, select: { workspaceId: true, leadEmail: true } });
      for (const m of mandates) {
        const o = await ownerFor(m.workspaceId, m.leadEmail.trim() || "");
        if (o) return o;
      }
      const conns = await prisma.metaConnection.findMany({ where: { pageId }, orderBy: { updatedAt: "desc" }, take: 5, select: { workspaceId: true } });
      for (const c of conns) {
        const o = await ownerFor(c.workspaceId, null);
        if (o) return o;
      }
      return null;
    },
    async findLead(leadgenId) {
      const row = await prisma.metaLead.findUnique({ where: { leadgenId }, select: { id: true, notifiedAt: true } });
      if (row) return row;
      // Alerted before MetaLead existed (AdsEvent claim): treat as already sent.
      const legacy = await prisma.adsEvent.findFirst({ where: { name: LEAD_ALERTED_EVENT, props: { path: ["leadgenId"], equals: leadgenId } }, select: { id: true, createdAt: true } });
      return legacy ? { id: legacy.id, notifiedAt: legacy.createdAt } : null;
    },
    async storeLead(r) {
      try {
        return await prisma.metaLead.create({
          data: { workspaceId: r.workspaceId, leadgenId: r.leadgenId, metaAdId: r.metaAdId, formId: r.formId, pageId: r.pageId, name: r.name, email: r.email, phone: r.phone, zip: r.zip, answers: r.answers, receivedAt: r.receivedAt },
          select: { id: true, notifiedAt: true },
        });
      } catch (e) {
        if (isUnique(e)) return null;
        throw e;
      }
    },
    async claimNotify(id) {
      const r = await prisma.metaLead.updateMany({ where: { id, notifiedAt: null }, data: { notifiedAt: new Date() } });
      return r.count === 1;
    },
    async releaseNotify(id) {
      await prisma.metaLead.updateMany({ where: { id }, data: { notifiedAt: null } });
    },
    async recordTeamLead({ workspaceId, leadgenId, summary }) {
      try {
        await prisma.marketingAction.create({ data: { workspaceId, role: "leads", kind: "lead_received", summary, dedupeKey: leadActionKey(leadgenId), evidence: { leadgenId } } });
      } catch (e) {
        if (!isUnique(e)) throw e;
      }
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team_first_lead:${workspaceId}`}))`;
        const prior = await tx.adsEvent.findFirst({ where: { name: TEAM_EVENTS.firstLead, workspaceId }, select: { id: true } });
        if (!prior) await tx.adsEvent.create({ data: { name: TEAM_EVENTS.firstLead, workspaceId, props: { leadgenId } } });
      });
    },
    async optedOut(userId) {
      return Boolean(await prisma.adsEvent.findFirst({ where: { name: "email_unsubscribed", userId }, select: { id: true } }));
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
