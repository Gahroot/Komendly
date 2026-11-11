// CSV of what each partner is owed right now (refund window passed, not yet paid).
import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { effectiveStatus, payablesCsv, type PayableRow } from "@/lib/ads/commissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const now = new Date();
  const rows = await prisma.adsCommission.findMany({ where: { status: { in: ["pending", "payable"] }, availableAt: { lte: now } } });
  const partners = await prisma.adsPartner.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.partnerId))] } } });
  const users = new Map((await prisma.user.findMany({ where: { id: { in: partners.map((p) => p.userId) } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u]));
  const out: PayableRow[] = partners.map((p) => {
    const mine = rows.filter((r) => r.partnerId === p.id && effectiveStatus(r, now) === "payable");
    const u = users.get(p.userId);
    return { partnerId: p.id, name: p.company || u?.name || "", email: u?.email ?? "", payoutEmail: p.payoutEmail ?? "", payoutMethod: p.payoutMethod ?? "", payableCents: mine.reduce((t, r) => t + r.commissionCents, 0), count: mine.length };
  });
  return new NextResponse(payablesCsv(out.filter((r) => r.count > 0)), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="partner-payables-${now.toISOString().slice(0, 10)}.csv"` },
  });
}
