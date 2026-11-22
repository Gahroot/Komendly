import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trackAdsEvent } from "@/lib/ads/events";
import { appBaseUrl, sendAdsMail } from "@/lib/ads/mailer";
import { adminNotifyEmail, partnerBusinessId, partnerRequestMail } from "@/lib/ads/meta/partner";
import { requireTeamAccess } from "@/lib/ads/team/server";
import { adsErrorResponse } from "@/lib/ads/workspace";

/** Founding setup: the owner added Komendly's Business as a partner. Records the event and emails the founder (once per 10 min). */
export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireTeamAccess();
    const recent = await prisma.adsEvent.count({ where: { name: "partner_access_requested", workspaceId: workspace.id, createdAt: { gt: new Date(Date.now() - 10 * 60_000) } } });
    if (recent === 0) {
      await trackAdsEvent("partner_access_requested", { workspaceId: workspace.id, userId: user.id, props: { businessId: partnerBusinessId() } });
      const adminUrl = `${appBaseUrl(new URL(request.url).origin)}/admin/ads/workspaces/${workspace.id}`;
      const mail = partnerRequestMail({ workspaceId: workspace.id, workspaceName: workspace.name, ownerEmail: user.email, adminUrl });
      await sendAdsMail({ to: adminNotifyEmail(), ...mail }).catch((e) => console.error("[ads/team] partner request mail failed", e));
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adsErrorResponse(error);
  }
}
