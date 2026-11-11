import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { prisma } from "@/lib/prisma";

const ADS_FLAG_KEYS = ["ezmotion", "meta_publish", "lifecycle_email"] as const;
const Body = z.object({ key: z.enum(ADS_FLAG_KEYS), enabled: z.boolean() });

export async function POST(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid flag" }, { status: 400 });
  const { key, enabled } = parsed.data;
  await prisma.adsFeatureFlag.upsert({ where: { key }, create: { key, enabled }, update: { enabled } });
  return NextResponse.json({ ok: true });
}
