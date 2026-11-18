// Kill switch for autopilot growth systems: AdsFeatureFlag sys_<key> (missing row = OFF).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { prisma } from "@/lib/prisma";
import { GROWTH_SYSTEMS, systemFlagKey, type SystemKey } from "@/lib/growth/systems";

const KEYS = GROWTH_SYSTEMS.map((s) => s.key) as [SystemKey, ...SystemKey[]];
const Body = z.object({ key: z.enum(KEYS), enabled: z.boolean() });

export async function POST(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid system" }, { status: 400 });
  const key = systemFlagKey(parsed.data.key);
  const { enabled } = parsed.data;
  await prisma.adsFeatureFlag.upsert({ where: { key }, create: { key, enabled }, update: { enabled } });
  return NextResponse.json({ ok: true });
}
