// Free trial ads start right after signup; downloading/exporting them needs a confirmed email.
// Paid workspaces and non-trial runs are never gated. Pure, client-safe (the server assert lives in download-gate-server.ts).

export const DOWNLOAD_GATE_MESSAGE = "Confirm your email to download. We just sent you a link.";

export function downloadNeedsVerifiedEmail(args: { isTrial: boolean; isPaid: boolean; emailVerified: boolean }): boolean {
  return args.isTrial && !args.isPaid && !args.emailVerified;
}
