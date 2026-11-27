// Public, read-only: is the maintenance flag on? Read by <MaintenanceBanner/>. Fails to "not in maintenance".
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MAINTENANCE_FLAG } from "@/lib/ops/incidents";

export const dynamic = "force-dynamic";

export async function GET() {
  const row = await prisma.adsFeatureFlag.findUnique({ where: { key: MAINTENANCE_FLAG }, select: { enabled: true } }).catch(() => null);
  return NextResponse.json({ maintenance: row?.enabled === true });
}
