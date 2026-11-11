import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { adminFeatureAction } from "@/lib/ads/feature-actions";
import { FeatureAdminAction } from "@/lib/ads/features";

export async function POST(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const parsed = FeatureAdminAction.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  try {
    const result = await adminFeatureAction(admin.user, { ...parsed.data, postUrl: parsed.data.postUrl || undefined });
    return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.error }, { status: 400 });
  } catch (err) {
    console.error("[admin/ads/features]", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
