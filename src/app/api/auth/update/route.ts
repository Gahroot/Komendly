import { NextResponse } from "next/server";
import { getSessionToken, validateSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request) {
  try {
    const token = await getSessionToken();

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const result = await validateSession(token);

    if (!result) {
      return NextResponse.json(
        { error: "Invalid or expired session" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name } = body;

    if (name !== undefined && typeof name !== "string") {
      return NextResponse.json(
        { error: "Invalid name format" },
        { status: 400 }
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: result.user.id },
      data: {
        ...(name !== undefined && { name: name.trim() || null }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        subscriptionStatus: true,
        minutesUsed: true,
        minutesLimit: true,
        bonusMinutes: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json(
      { error: "An error occurred while updating profile" },
      { status: 500 }
    );
  }
}
