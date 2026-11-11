// Server-only: route assert for the trial download gate (imports workspace -> auth, so never import from client code).
import { isPaidWorkspace } from "./billing-gates";
import { DOWNLOAD_GATE_MESSAGE, downloadNeedsVerifiedEmail } from "./download-gate";
import { AdsHttpError } from "./workspace";

/** Throws 403 `email_unverified` when an unverified, unpaid user tries to export a trial run's files. */
export function assertCanDownload(
  user: { emailVerifiedAt: Date | null },
  workspace: Parameters<typeof isPaidWorkspace>[0],
  run: { isTrial: boolean },
): void {
  if (downloadNeedsVerifiedEmail({ isTrial: run.isTrial, isPaid: isPaidWorkspace(workspace), emailVerified: Boolean(user.emailVerifiedAt) })) {
    throw new AdsHttpError(403, "email_unverified", DOWNLOAD_GATE_MESSAGE);
  }
}
