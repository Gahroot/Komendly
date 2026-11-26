import type { Metadata } from "next";
import { ChallengeClient } from "@/components/hubs/challenge-client";
import { HubShell } from "@/components/hubs/hub-shell";
import { hubsEnabled } from "@/lib/growth/creative-hubs-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The 60-second website-to-ad challenge", description: "How fast can you go from your website to an ad brief? Start the clock and share your time.", alternates: { canonical: "/challenge" } };

export default async function Page() {
  const open = await hubsEnabled();
  return (
    <HubShell title="The 60-second website-to-ad challenge" lead="Start the clock, enter your website, stop it. You get a shareable time card, then Komendly makes your free ads from your site. We time the start, not the finished ads.">
      {open ? <ChallengeClient /> : <p className="rounded-2xl border border-border p-5 text-muted-foreground">This isn&apos;t open yet. Check back soon.</p>}
    </HubShell>
  );
}
