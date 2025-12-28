import { NextResponse } from "next/server";
import { getSessionToken, validateSession } from "@/lib/auth";
import { authLogger, createRequestTimer, generateRequestId, logError } from "@/lib/logger";

export async function GET() {
  const requestId = generateRequestId();
  const timer = createRequestTimer();
  const log = authLogger.child({ requestId, endpoint: "auth/me" });

  log.debug({ method: "GET" }, "Fetching current user");

  try {
    // Get current session token
    const token = await getSessionToken();

    if (!token) {
      log.debug({ durationMs: timer.getDuration() }, "No session token found");
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Validate the session
    const result = await validateSession(token);

    if (!result) {
      log.debug({ durationMs: timer.getDuration() }, "Invalid or expired session");
      return NextResponse.json(
        { error: "Invalid or expired session" },
        { status: 401 }
      );
    }

    // Return user data (excluding passwordHash)
    const { passwordHash: _passwordHash, ...userData } = result.user;

    log.debug(
      { userId: result.user.id, durationMs: timer.getDuration() },
      "User data fetched successfully"
    );

    return NextResponse.json({
      user: userData,
    });
  } catch (error) {
    logError(log, error, "Get user error", { durationMs: timer.getDuration() });
    return NextResponse.json(
      { error: "An error occurred while fetching user data" },
      { status: 500 }
    );
  }
}
