import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Check, Clock, Gift, Star, UserRound } from "lucide-react";
import { AdsNav } from "@/components/ads/ads-nav";
import { ClaimFreeMonthButton, ReferShare } from "@/components/growth/refer-share";
import { getCurrentUser } from "@/lib/auth";
import { getPlan } from "@/lib/ads/billing-config";
import { FREE_MONTH_AFTER, MONTHLY_REWARD_CAP, REFERRED_TRIAL_STATIC, REFERRER_REWARD_CREDITS, REWARD_EXPIRY_DAYS, referralSummary, type ReferralFriendView } from "@/lib/ads/referrals";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Give 10, get 10", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STATUS: Record<ReferralFriendView["status"], { label: string; cls: string }> = {
  signed_up: { label: "Signed up", cls: "border-border text-muted-foreground" },
  trial_done: { label: "Free ads done", cls: "border-sky-400/40 bg-sky-400/10 text-sky-200" },
  rewarded: { label: `+${REFERRER_REWARD_CREDITS} credits`, cls: "border-[var(--studio-gold)]/50 bg-[var(--studio-gold)]/15 text-[var(--studio-gold)]" },
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default async function ReferPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/ads/login?next=/ads/refer");
  const ws = await getOrCreateWorkspace(user);
  const s = await referralSummary(user, ws);
  const starter = getPlan("starter");
  const starterPrice = starter ? `$${starter.priceCents / 100}` : "$49";
  const toward = Math.min(s.rewardedCount, FREE_MONTH_AFTER);
  const live = s.credits.filter((c) => !c.expired);
  const rules = [
    `Your friend gets ${REFERRED_TRIAL_STATIC} free ads for their website, double the usual 10.`,
    `You get ${REFERRER_REWARD_CREDITS} ad credits when their free ads finish.`,
    `Credits expire ${REWARD_EXPIRY_DAYS} days after you earn them.`,
    `Rewards count for up to ${MONTHLY_REWARD_CAP} friends a month.`,
    `${FREE_MONTH_AFTER} rewarded friends earn a free month of Starter. It needs a card and continues at ${starterPrice}/month unless you cancel.`,
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        <section className="studio-frame relative overflow-hidden rounded-3xl p-5 sm:p-8">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-[var(--studio-gold)]/10 blur-3xl" />
          <div className="relative grid gap-6 md:grid-cols-[1fr_1.1fr] md:items-center">
            <div className="flex items-start gap-4">
              <Image src="/brand/ozzy-classic-love.png" alt="" width={88} height={88} unoptimized className="size-16 shrink-0 [image-rendering:pixelated] sm:size-20" />
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Give {REFERRER_REWARD_CREDITS}, get {REFERRER_REWARD_CREDITS}</p>
                <h1 className="font-display mt-2 text-balance text-[1.9rem] font-medium leading-[1.08] tracking-[-0.02em] sm:text-4xl">
                  Give a friend {REFERRED_TRIAL_STATIC} free ads. Get {REFERRER_REWARD_CREDITS} for you.
                </h1>
                <p className="mt-2 text-sm text-muted-foreground sm:text-base">Know a business owner who runs Facebook or Instagram ads? Send them your link.</p>
              </div>
            </div>
            <ReferShare link={s.shareUrl} />
          </div>
        </section>

        <section className="glass rounded-3xl p-5 sm:p-6" aria-labelledby="progress-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="progress-title" className="text-lg font-semibold">
                {s.freeMonth === "claimed" ? "Free month claimed. Thank you!" : `${toward} of ${FREE_MONTH_AFTER} friends toward a free month of Starter`}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {s.freeMonth === "available" ? "You did it. Claim your month: 20 credits, every size, animated ads."
                  : s.freeMonth === "subscribed" ? "You're already on a plan, so your friends earn you credits instead."
                  : s.freeMonth === "claimed" ? "Keep sharing: every friend still earns you 10 credits."
                  : "A friend counts once their free ads are done."}
              </p>
            </div>
            {s.freeMonth === "available" && <ClaimFreeMonthButton />}
          </div>
          <ol className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
            {Array.from({ length: FREE_MONTH_AFTER }, (_, i) => {
              const done = i < toward;
              return (
                <li key={i} className={cn("flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border text-xs font-medium sm:h-20", done ? "border-[var(--studio-gold)]/60 bg-[var(--studio-gold)]/15 text-[var(--studio-gold)]" : "border-dashed border-border text-muted-foreground")}>
                  <Star className={cn("size-5", done && "fill-current")} aria-hidden />
                  Friend {i + 1}
                </li>
              );
            })}
          </ol>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="glass rounded-3xl p-5 sm:p-6" aria-labelledby="friends-title">
            <h2 id="friends-title" className="text-lg font-semibold">Your friends</h2>
            {s.friends.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No one yet. The first friend who signs up shows here.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {s.friends.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 py-3">
                    <span className="flex size-9 items-center justify-center rounded-full bg-white/[0.06] text-sm font-semibold">{f.name.charAt(0) || <UserRound className="size-4" />}</span>
                    <div className="min-w-0 flex-1"><p className="truncate font-medium">{f.name}</p><p className="text-xs text-muted-foreground">Joined {day(f.createdAt)}</p></div>
                    <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", STATUS[f.status].cls)}>{STATUS[f.status].label}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="glass rounded-3xl p-5 sm:p-6" aria-labelledby="credits-title">
            <h2 id="credits-title" className="text-lg font-semibold">Credits earned</h2>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{live.reduce((t, c) => t + c.credits, 0)}<span className="ml-1.5 text-sm font-normal text-muted-foreground">active credits</span></p>
            {s.credits.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">You earn {REFERRER_REWARD_CREDITS} credits each time a friend&apos;s free ads finish.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {s.credits.map((c) => (
                  <li key={c.earnedAt} className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm">
                    <span className="flex items-center gap-2"><Gift className="size-4 text-[var(--studio-gold)]" aria-hidden />+{c.credits} on {day(c.earnedAt)}</span>
                    <span className={cn("flex items-center gap-1 text-xs", c.expired ? "text-muted-foreground line-through" : "text-[var(--studio-gold)]")}><Clock className="size-3.5" aria-hidden />{c.expired ? "expired" : "expires"} {day(c.expiresAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="rounded-3xl border border-border p-5 sm:p-6" aria-labelledby="rules-title">
          <h2 id="rules-title" className="text-lg font-semibold">How it works</h2>
          <ul className="mt-3 grid gap-2.5 text-sm text-muted-foreground sm:grid-cols-2">
            {rules.map((r) => <li key={r} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[var(--studio-gold)]" aria-hidden />{r}</li>)}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">Signing up yourself, from the same company email domain, device or network doesn&apos;t count.</p>
        </section>
      </main>
    </div>
  );
}
