import { z } from "zod";
import { rateLimit } from "@/lib/ads/abuse";
import { trackAdsEvent } from "@/lib/ads/events";
import { READINESS_CODES } from "@/lib/ads/meta/readiness";
import { requireWorkspaceMember } from "@/lib/ads/workspace";

const EventSchema = z.discriminatedUnion("name", [
  z.object({ runId: z.string().min(1), name: z.literal("meta_step_viewed"), step: z.string().regex(/^[a-z_]{1,20}$/) }),
  z.object({ runId: z.string().min(1), name: z.literal("meta_readiness_issue"), code: z.enum(READINESS_CODES) }),
]);

/** Funnel beacon from the Publish to Meta dialog. Workspace members only; always 204 so analytics never breaks the flow. */
export async function POST(request: Request) {
  const done = new Response(null, { status: 204 });
  try {
    const parsed = EventSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return done;
    const { user, workspace } = await requireWorkspaceMember({ runId: parsed.data.runId });
    if (!(await rateLimit(`meta_event:${workspace.id}`, 120, 3600))) return done;
    const { name, runId, ...props } = parsed.data;
    await trackAdsEvent(name, { workspaceId: workspace.id, userId: user.id, runId, props });
  } catch {
    // not signed in / not a member / DB hiccup: drop the event
  }
  return done;
}
