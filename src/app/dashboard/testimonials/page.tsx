import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";
import { loadHubItems } from "@/lib/hub/load-summary";
import { canMakeTestimonials, testimonialVideosLeft } from "@/lib/hub/summary";
import { HubItemTile } from "@/components/hub/hub-items";

export const metadata: Metadata = { title: "Testimonials" };
export const dynamic = "force-dynamic";

export default async function TestimonialsHome() {
  const user = await getCurrentUser();
  if (!user) return null;
  const ws = await getOrCreateWorkspace(user);
  const items = await loadHubItems(user, ws, { app: "testimonials", limit: 24 });
  const allowed = canMakeTestimonials(user);
  const left = testimonialVideosLeft(user);
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--studio-gold)]">Testimonials</p>
          <h1 className="font-display mt-1 text-3xl font-semibold tracking-tight">Your testimonial videos</h1>
          <p className="mt-1 text-muted-foreground">
            {allowed ? `${left} ${left === 1 ? "video" : "videos"} left.` : "Premium: included with Scale and Agency, or as one-off packs."}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/videos" className="inline-flex h-11 items-center rounded-2xl border border-border px-4 text-sm font-medium hover:bg-accent/60">All videos</Link>
          <Link href="/dashboard/create-fal" className="spellbar__cta inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold">
            {allowed ? <Plus aria-hidden className="size-4" /> : <Lock aria-hidden className="size-4" />}
            {allowed ? "Make a testimonial" : "Unlock testimonials"}
          </Link>
        </div>
      </div>
      {items.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{items.map((i) => <HubItemTile key={i.id} item={i} />)}</div>
      ) : (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No testimonial videos yet.</div>
      )}
    </div>
  );
}
