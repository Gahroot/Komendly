// Server-side admin guard for /admin/ads pages and /api/admin/ads routes.
import type { User } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export type AdminCheck = { ok: true; user: User } | { ok: false; response: NextResponse };

export async function checkAdmin(): Promise<AdminCheck> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!user.isAdmin) return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true, user };
}

/** For server components: the admin user or null (page renders a forbidden state). */
export async function getAdminUser(): Promise<User | null> {
  const user = await getCurrentUser();
  return user?.isAdmin ? user : null;
}
