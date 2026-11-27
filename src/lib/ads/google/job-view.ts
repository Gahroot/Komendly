// AdJob + GooglePublish rows -> the `job` the Google dialog follows. Pure (no Prisma), so it is unit-tested.
// AdJob statuses: queued | running | succeeded | failed (will retry while attempts < maxAttempts) | dead | canceled.

export interface GoogleJobRow { id: string; type: string; status: string; attempts: number; maxAttempts: number; lastError: string | null }
export interface GooglePublishRowLite { jobId: string | null; status: string; error: string | null }
export interface GoogleJobView {
  id: string;
  type: string;
  status: "queued" | "running" | "succeeded" | "failed";
  error?: string;
  /** Failed publish where nothing reached Google: "Try again" may enqueue a new publish. */
  canRetry?: boolean;
}

const PUBLISH_FAILED = "We couldn't create your campaign. Nothing was made in Google Ads and nothing was charged. Please try again.";
const ACTIVATE_FAILED = "Google didn't accept the change. Please try again.";

/** Internal / technical messages never reach the owner. */
export function plainGoogleError(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (s.length < 8 || s.length > 300 || !/\s/.test(s)) return null;
  if (/[{}[\]<>]|\n|\bat\s+\S+\s*\(|Error:|stack|undefined|null|payload|_google\b|needs (runId|workspaceId)|GoogleAds|gRPC|INVALID_|PERMISSION_|_ERROR\b|ECONN|fetch failed|timed? ?out after/i.test(s)) return null;
  return s;
}

export function jobStatusOf(j: Pick<GoogleJobRow, "status" | "attempts" | "maxAttempts">): GoogleJobView["status"] {
  if (j.status === "queued" || j.status === "running" || j.status === "succeeded") return j.status;
  if (j.status === "failed" && j.attempts < j.maxAttempts) return "queued"; // retry is scheduled
  return "failed"; // failed (no attempts left), dead, canceled
}

export function googleJobView(job: GoogleJobRow, rows: GooglePublishRowLite[]): GoogleJobView {
  const status = jobStatusOf(job);
  const view: GoogleJobView = { id: job.id, type: job.type, status };
  if (status !== "failed") return view;
  const isPublish = job.type.includes("publish");
  const mine = rows.filter((r) => r.jobId === job.id);
  const anyPublished = mine.some((r) => r.status === "published");
  const rowError = mine.map((r) => plainGoogleError(r.error)).find((e): e is string => !!e);
  view.error = rowError ?? plainGoogleError(job.lastError) ?? (isPublish && !anyPublished ? PUBLISH_FAILED : ACTIVATE_FAILED);
  if (isPublish) view.canRetry = !anyPublished;
  return view;
}
