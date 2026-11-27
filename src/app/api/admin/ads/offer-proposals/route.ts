import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { approveOfferProposal, rejectOfferProposal } from "@/lib/offer-intel/server";

const Body = z.object({ id: z.string().min(1), action: z.enum(["approve", "reject"]) });

/** Owner decision on an offer_proposal (copy/ordering experiment). Approving still enforces slots, copy lint and the per-surface cap. Never changes prices. */
export async function POST(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (parsed.data.action === "reject") { await rejectOfferProposal(parsed.data.id); return NextResponse.json({ ok: true }); }
  const r = await approveOfferProposal(parsed.data.id);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error ?? "Could not approve" }, { status: 409 });
}
