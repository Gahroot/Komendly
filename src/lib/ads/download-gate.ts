// Downloads are never blocked on email confirmation (autopilot plan funnel fix: 18 of 52 sign-ups never confirmed and
// could not download). The free pack limit (bonus-access.ts trialLockedAdIds) is what holds paid value back now.
// Kept as a function so the server assert, the UI gate and the MCP tools keep one call site. Pure, client-safe.

export const DOWNLOAD_GATE_MESSAGE = "Confirm your email to download. We just sent you a link.";

export function downloadNeedsVerifiedEmail(_args: { isTrial: boolean; isPaid: boolean; emailVerified: boolean }): boolean {
  return false;
}
