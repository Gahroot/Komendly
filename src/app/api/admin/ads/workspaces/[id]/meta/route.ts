import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { prisma } from "@/lib/prisma";
import { graphVersion } from "@/lib/ads/meta/config";
import { loadMetaToken, saveMetaSelection } from "@/lib/ads/meta/connection";
import { listPartnerAssets } from "@/lib/ads/meta/partner";
import { accountReadiness } from "@/lib/ads/meta/readiness";
import { AdsHttpError } from "@/lib/ads/workspace";

/** Partner setup: every ad account + Page the connected (founder's) token can use, incl. partner-shared client assets. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await params;
  const conn = await prisma.metaConnection.findUnique({ where: { workspaceId: id }, select: { viaPartner: true, adAccountId: true, pageId: true, tokenExpiresAt: true } });
  if (!conn) return NextResponse.json({ connected: false });
  try {
    const token = await loadMetaToken(id);
    if (token.mode !== "graph") return NextResponse.json({ error: "This connection uses MCP mode; reconnect via partner access." }, { status: 409 });
    const { adAccounts, pages } = await listPartnerAssets({ accessToken: token.accessToken, version: graphVersion() });
    return NextResponse.json({
      connected: true, viaPartner: conn.viaPartner, selection: { adAccountId: conn.adAccountId, pageId: conn.pageId },
      adAccounts: adAccounts.map((a) => ({ id: a.id, name: a.name, readiness: accountReadiness(a, pages) })), pages,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't reach Meta." }, { status: e instanceof AdsHttpError ? e.status : 502 });
  }
}

const Body = z.object({ adAccountId: z.string().regex(/^(act_)?\d+$/), pageId: z.string().regex(/^\d+$/) });

/** Pick the customer's ad account + Page for this workspace (admin only; customers can't change a partner selection). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick an ad account and a Page" }, { status: 400 });
  try {
    await saveMetaSelection(id, parsed.data);
  } catch (e) {
    if (e instanceof AdsHttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
