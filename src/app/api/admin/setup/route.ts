import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// One-time setup endpoint to create initial admin
// DELETE THIS FILE after use for security
export async function POST(request: NextRequest) {
  try {
    const { email, secret } = await request.json();

    // Simple secret check - change this or remove after use
    if (secret !== process.env.ADMIN_SETUP_SECRET) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 403 });
    }

    const user = await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { isAdmin: true },
      select: { id: true, email: true, name: true, isAdmin: true },
    });

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("Admin setup error:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
