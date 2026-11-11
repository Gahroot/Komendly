import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { FIRST_VIDEO_OFFER, VIDEO_PACK_OFFER, formatUsd } from "@/lib/first-video-offer";
import { canMakeTestimonials } from "@/lib/hub/summary";
import { TESTIMONIALS_PER_MONTH } from "@/lib/hub/money-model";
import { OzzyPerch } from "@/components/testimonials/ozzy-perch";

/** Server-side gate for the testimonial create flow (middleware does not enforce plans). */
export async function TestimonialGate({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (canMakeTestimonials(user)) return <>{children}</>;
  return (
    <div className="mx-auto max-w-2xl pt-16">
      <div className="relative rounded-3xl border border-border bg-[oklch(0.16_0.06_290/0.7)] p-6 pt-10 backdrop-blur-xl sm:p-8 sm:pt-12">
        <OzzyPerch size={88} className="absolute -top-[80px] left-6" mood={{ form: "classic", expression: "focused", motion: "think", line: "These ones take real presenters. Worth it." }} />
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--studio-gold)]"><Lock aria-hidden className="mr-1 inline size-3" /> Premium</p>
        <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight">AI testimonial videos</h1>
        <p className="mt-2 text-muted-foreground">
          A realistic presenter reads your real customer review on camera. They cost us the most to make, so they&apos;re kept for
          top plans: Scale includes {TESTIMONIALS_PER_MONTH.scale} a month and Agency {TESTIMONIALS_PER_MONTH.agency} a month.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/ads/billing" className="spellbar__cta inline-flex h-12 items-center justify-center rounded-2xl px-4 font-semibold">See Scale and Agency</Link>
          <Link href="/pricing" className="inline-flex h-12 items-center justify-center rounded-2xl border border-border px-4 font-medium hover:bg-accent/60">
            One-off packs from {formatUsd(FIRST_VIDEO_OFFER.priceCents)}
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {FIRST_VIDEO_OFFER.name}: {FIRST_VIDEO_OFFER.minutes} videos for {formatUsd(FIRST_VIDEO_OFFER.priceCents)} · {VIDEO_PACK_OFFER.name}: {formatUsd(VIDEO_PACK_OFFER.priceCents)}
        </p>
      </div>
    </div>
  );
}
