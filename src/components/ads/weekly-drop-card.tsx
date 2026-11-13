// Ozzy Autopilot card (dashboard + Ad Packs): ON/OFF, next drop, inline focus, last week's ads + video.
// Not eligible: the same card as a locked teaser linking to /pricing?utm_source=autopilot.
import Link from "next/link";
import { Lock, PlayCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AUTOPILOT_UPGRADE_HREF } from "@/lib/ads/autopilot";
import { loadAutopilot } from "@/lib/ads/autopilot-server";
import { WEEKLY_TEASER } from "@/lib/ads/weekly-drop";
import { AutopilotControls } from "./autopilot-controls";

export async function WeeklyDropCard({ workspace }: { workspace: { id: string; adsPlan: string; subscriptionStatus: string; suspendedAt: Date | null } }) {
  const ap = await loadAutopilot(workspace);
  if (!ap.eligible) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold"><Lock aria-hidden className="size-4" /> Ozzy Autopilot <span className="text-xs font-normal text-muted-foreground">OFF</span></CardTitle>
          <CardDescription>{WEEKLY_TEASER}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={AUTOPILOT_UPGRADE_HREF} className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Turn on Autopilot</Link>
        </CardContent>
      </Card>
    );
  }
  const d = ap.lastDrop;
  const done = d ? ["completed", "partial", "failed", "canceled"].includes(d.status) : false;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Ozzy Autopilot</CardTitle>
        <CardDescription>{ap.nextDrop}. Fresh ads{ap.includeVideo ? " and a new video" : ""} every week, steered by your focus.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AutopilotControls enabled={ap.enabled} focus={ap.focus} />
        {!d ? (
          <p className="text-sm text-muted-foreground">Your first drop is on its way. Make a run from your website so Ozzy knows your brand.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">Last drop: {d.title}</p>
            {d.ads.length === 0 ? (
              <p className="text-sm text-muted-foreground">{done ? "No ads this week." : "Ozzy is making this week's ads. We'll email you when they're ready."}</p>
            ) : (
              <Link href={d.url} className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {d.ads.map((a) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={a.id} src={a.thumbnailUrl} alt={a.headline} loading="lazy" className="aspect-[4/5] w-full rounded-lg object-cover" />
                ))}
              </Link>
            )}
            {d.video && d.video.status !== "not_made" ? (
              <Link href={d.video.url} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                <PlayCircle aria-hidden className="size-4" /> {d.video.status === "ready" ? "Watch your Monday video" : "Ozzy is making your Monday video"}
              </Link>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
