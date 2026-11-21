// Jobber -> Komendly ad ideas. Pure. A closed job / completed visit becomes one "fresh local proof" idea; the latest ideas
// become the workspace's Ozzy Autopilot focus (the one sentence that steers the Weekly Drop, engine/src/jobs/weekly.ts),
// but only while the member hasn't written a focus of their own. No client names or street addresses are kept.
import { AUTOPILOT_FOCUS_MAX, cleanFocus } from "@/lib/ads/autopilot";

/** Fields we read from Jobber's Job object (see JOB_FIELDS in graphql.ts). */
export interface JobberJob {
  id: string;
  title?: string | null;
  jobStatus?: string | null;
  completedAt?: string | null;
  property?: { address?: { city?: string | null; province?: string | null } | null } | null;
  lineItems?: { nodes?: Array<{ name?: string | null } | null> | null } | null;
}

export interface AdIdea {
  jobId: string;
  service: string;
  city: string | null;
  region: string | null;
  at: string;
}

export const MAX_IDEAS = 5;

function clean(s: string | null | undefined, max: number): string | null {
  const v = (s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!v || /^[\d\s#-]+$/.test(v)) return null;
  return v.length > max ? v.slice(0, max).trim() : v;
}

/**
 * One idea per finished job. The service name comes from the first line item (price-book names like "Roof replacement"),
 * else the job title with a "Client - " / "#123" prefix dropped, since titles often start with the client's name.
 */
export function jobIdea(job: JobberJob | null | undefined, now: Date = new Date()): AdIdea | null {
  if (!job?.id) return null;
  const item = job.lineItems?.nodes?.map((n) => clean(n?.name, 60)).find(Boolean) ?? null;
  const title = clean(job.title?.replace(/^#?\d+\s*[-:]\s*/, "").replace(/^[^-:]{1,40}\s[-:]\s/, ""), 60);
  const service = item ?? title;
  if (!service) return null;
  const a = job.property?.address;
  return { jobId: job.id, service, city: clean(a?.city, 40), region: clean(a?.province, 20), at: job.completedAt ?? now.toISOString() };
}

/** Newest first, one per job, at most MAX_IDEAS. */
export function mergeIdeas(prev: AdIdea[], idea: AdIdea): AdIdea[] {
  return [idea, ...prev.filter((i) => i.jobId !== idea.jobId)].slice(0, MAX_IDEAS);
}

const place = (i: AdIdea) => [i.city, i.region].filter(Boolean).join(", ");

/** "Fresh proof from Jobber: roof replacement in Austin, TX; ... Build ads around these recent local jobs." (<= 200 chars) */
export function ideasToFocus(ideas: AdIdea[]): string | null {
  const head = "Fresh proof from Jobber, just finished: ";
  const tail = ". Build ads around these recent local jobs.";
  const parts: string[] = [];
  for (const i of ideas) {
    const where = place(i);
    const part = `${i.service.toLowerCase()}${where ? ` in ${where}` : ""}`;
    if ((head + [...parts, part].join("; ") + tail).length > AUTOPILOT_FOCUS_MAX) break;
    parts.push(part);
  }
  return parts.length ? cleanFocus(head + parts.join("; ") + tail) : null;
}

/** Write our focus only over an empty focus or one we wrote last time: the member's own words always win. */
export function mayWriteFocus(current: string | null | undefined, lastWritten: string | null | undefined): boolean {
  return !current || (Boolean(lastWritten) && current === lastWritten);
}
