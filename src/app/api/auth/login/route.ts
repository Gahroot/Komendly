import { NextRequest, NextResponse } from "next/server";
import {
  getUserByEmail,
  verifyPassword,
  createSession,
  setSessionCookie,
} from "@/lib/auth";
import { authLogger, createRequestTimer, generateRequestId, logError } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const timer = createRequestTimer();
  const log = authLogger.child({ requestId, endpoint: "auth/login" });

  log.info({ method: "POST" }, "Login attempt started");

  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      log.warn("Login attempt with missing credentials");
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    log.debug({ email }, "Looking up user by email");

    // Get user by email
    const user = await getUserByEmail(email);

    if (!user) {
      log.warn({ email, durationMs: timer.getDuration() }, "Login failed - user not found");
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);

    if (!isValid) {
      log.warn({ email, userId: user.id, durationMs: timer.getDuration() }, "Login failed - invalid password");
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Check if user has an active subscription
    const validStatuses = ["active", "trialing"];
    const hasActiveSubscription = validStatuses.includes(user.subscriptionStatus);
    const hasPaidPlan = user.plan !== "pending" && user.plan !== "free";

    // If user doesn't have an active subscription, redirect to pricing
    if (!hasActiveSubscription || !hasPaidPlan) {
      log.info(
        { userId: user.id, email, plan: user.plan, status: user.subscriptionStatus, durationMs: timer.getDuration() },
        "Login successful but subscription incomplete - redirecting to pricing"
      );

      // Don't create session for users without active subscription
      const { passwordHash: _ph1, ...userData } = user;

      return NextResponse.json({
        user: userData,
        message: "Please complete your subscription to access the dashboard.",
        requiresPayment: true,
        redirectTo: `/pricing?userId=${user.id}&email=${encodeURIComponent(email)}`,
      });
    }

    // Create session only for users with active subscription
    log.debug({ userId: user.id }, "Creating session");
    const token = await createSession(user.id);

    // Set session cookie
    await setSessionCookie(token);

    // Return user data (excluding passwordHash)
    const { passwordHash: _ph2, ...userData } = user;

    log.info(
      { userId: user.id, email, durationMs: timer.getDuration() },
      "Login successful"
    );

    return NextResponse.json({
      user: userData,
      message: "Login successful",
    });
  } catch (error) {
    logError(log, error, "Login error", { durationMs: timer.getDuration() });
    return NextResponse.json(
      { error: "An error occurred during login" },
      { status: 500 }
    );
  }
}
