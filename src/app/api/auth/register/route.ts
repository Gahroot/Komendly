import { NextRequest, NextResponse } from "next/server";
import {
  getUserByEmail,
  createUser,
} from "@/lib/auth";
import { fingerprintFrom } from "@/lib/ads/run";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";
import { STUDIO_INVITE_COOKIE } from "@/lib/studio/invite";
import { claimStudioInviteAtSignup } from "@/lib/studio/invite-server";
import { authLogger, createRequestTimer, generateRequestId, logError } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const timer = createRequestTimer();
  const log = authLogger.child({ requestId, endpoint: "auth/register" });

  log.info({ method: "POST" }, "Registration attempt started");

  try {
    const body = await request.json();
    const { email, password, name } = body;

    // Validate input
    if (!email || !password || !name) {
      log.warn("Registration attempt with missing fields");
      return NextResponse.json(
        { error: "Email, password, and name are required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      log.warn({ email }, "Registration attempt with invalid email format");
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      log.warn({ email }, "Registration attempt with weak password");
      return NextResponse.json(
        { error: "Password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    log.debug({ email }, "Checking for existing user");

    // Check if user already exists
    const existingUser = await getUserByEmail(email);

    if (existingUser) {
      log.warn({ email, durationMs: timer.getDuration() }, "Registration failed - email already exists");
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Create user with pending status (no session/login until payment)
    log.debug({ email, name }, "Creating new user with pending status");
    const user = await createUser({
      email,
      password,
      name,
    });

    // Ozzy Studio invite cookie: the invited friend gets 2 free Studio videos (never fails registration).
    const studioInvite = request.cookies.get(STUDIO_INVITE_COOKIE)?.value;
    if (studioInvite) {
      await getOrCreateWorkspace(user)
        .then((workspace) => claimStudioInviteAtSignup({ token: studioInvite, user, workspace, fp: fingerprintFrom(request), friendIsNew: true }))
        .catch((error) => console.error("[studio] invite claim at register failed", error));
    }

    // Return user data for redirect to pricing (NO session created)
    // User must complete payment before getting access
    const { passwordHash: _passwordHash, ...userData } = user;

    log.info(
      { userId: user.id, email, durationMs: timer.getDuration() },
      "Registration successful - redirecting to pricing"
    );

    return NextResponse.json({
      user: userData,
      message: "Registration successful. Please select a plan to continue.",
      requiresPayment: true,
      redirectTo: `/pricing?userId=${user.id}&email=${encodeURIComponent(email)}`,
    });
  } catch (error) {
    logError(log, error, "Registration error", { durationMs: timer.getDuration() });
    return NextResponse.json(
      { error: "An error occurred during registration" },
      { status: 500 }
    );
  }
}
