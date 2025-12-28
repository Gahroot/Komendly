import { NextResponse } from "next/server";
import {
  getSessionToken,
  invalidateSession,
  deleteSessionCookie,
} from "@/lib/auth";

export async function POST() {
  try {
    // Get current session token
    const token = await getSessionToken();

    if (token) {
      // Invalidate the session in database
      await invalidateSession(token);
    }

    // Delete the session cookie
    await deleteSessionCookie();

    return NextResponse.json({
      message: "Logout successful",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: "An error occurred during logout" },
      { status: 500 }
    );
  }
}
