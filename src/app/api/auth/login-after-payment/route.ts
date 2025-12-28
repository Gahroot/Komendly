import { NextRequest, NextResponse } from "next/server";
import { createSession, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// This endpoint is called after successful payment to create a session
// It verifies that the user has an active subscription before allowing login
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Get user and verify they have an active subscription
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        subscriptionStatus: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Verify user has completed payment (active subscription)
    const validStatuses = ["active", "trialing"];
    if (!validStatuses.includes(user.subscriptionStatus)) {
      return NextResponse.json(
        { error: "Payment not completed. Please complete checkout first." },
        { status: 403 }
      );
    }

    // Verify user has a valid plan (not pending)
    if (user.plan === "pending") {
      return NextResponse.json(
        { error: "Subscription not active. Please select a plan." },
        { status: 403 }
      );
    }

    // Create session and set cookie
    const token = await createSession(userId);
    await setSessionCookie(token);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
      },
    });
  } catch (error) {
    console.error("Login after payment error:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
