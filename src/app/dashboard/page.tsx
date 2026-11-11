import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Megaphone, Sparkles, Video, Lock } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";
import { loadHubSummary } from "@/lib/hub/load-summary";
import { greetingLine, type HubSummary } from "@/lib/hub/summary";
import { STUDIO_LAUNCH_OFFER } from "@/lib/hub/money-model";
import { OzzyPerch } from "@/components/testimonials/ozzy-perch";
import { HubPrompt } from "@/components/hub/hub-prompt";
import { HubItemTile } from "@/components/hub/hub-items";

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

const card = "rounded-3xl border border-border bg-[oklch(0.16_0.06_290/0.6)] backdrop-blur-xl";

export default async function HubHome() {
  const user = await getCurrentUser();
  if (!user) return null; // layout redirects
  const ws = await getOrCreateWorkspace(user);
  const s = await loadHubSummary(user, ws, new Date());
  return (
    <div className="space-y-10">
      <section className="pt-16">
        <OzzyPerch size={88} className="-mb-2 ml-2" mood={{ form: "classic", expression: "happy", motion: "wave", line: greetingLine(s) }} />
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">What do you want to make?</h1>
        <p className="mt-1 text-muted-foreground">Tell Ozzy in plain words. He&apos;ll make it in Ozzy Studio.</p>
        <div className="mt-5 max-w-3xl"><HubPrompt /></div>
      </section>

      <section aria-labelledby="apps" className="space-y-4">
        <h2 id="apps" className="font-display text-xl font-semibold">Your apps</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <AppCard href="/studio" icon={Sparkles} name="Ozzy Studio" badge="New" count={s.counts.studio} unit="video" blurb="Chat with Ozzy to make promos, motion graphics and edits of your own footage." cta="Open Studio" />
          <AppCard href="/ads/app" icon={Megaphone} name="Ad Packs" count={s.counts.ads} unit="ad" blurb="Drop in your website and get a pack of on-brand ads, ready for Meta." cta="Make ads" />
          <AppCard href="/dashboard/testimonials" icon={Video} name="Testimonials" count={s.counts.testimonials} unit="video" blurb="A realistic presenter reads your best customer review on camera." cta={s.canMakeTestimonials ? "Make a testimonial" : "See how to unlock"} locked={!s.canMakeTestimonials} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="recent" className="min-w-0 space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="recent" className="font-display text-xl font-semibold">Recent across everything</h2>
            <Link href="/dashboard/library" className="text-sm text-muted-foreground hover:text-foreground">Library <ArrowRight aria-hidden className="inline size-3.5" /></Link>
          </div>
          {s.recent.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {s.recent.map((i) => <HubItemTile key={i.id} item={i} />)}
            </div>
          ) : (
            <div className={`${card} border-dashed p-8 text-center text-sm text-muted-foreground`}>Nothing yet. What you make in any app shows up here.</div>
          )}
        </section>
        <PlanCard s={s} />
      </div>
    </div>
  );
}

function AppCard(p: { href: string; icon: typeof Sparkles; name: string; badge?: string; count: number; unit: string; blurb: string; cta: string; locked?: boolean }) {
  const Icon = p.icon;
  return (
    <Link href={p.href} className={`${card} group flex flex-col p-5 transition-colors hover:border-[var(--studio-gold)]/50`}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-[#7b3cf0]/25 text-[var(--studio-gold)]"><Icon aria-hidden className="size-5" /></span>
        <span className="font-display text-lg font-semibold">{p.name}</span>
        {p.badge ? <span className="ml-auto rounded-full bg-[var(--studio-gold)] px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#2a0f10]">{p.badge}</span> : null}
        {p.locked ? <Lock aria-label="Premium" className="ml-auto size-4 text-muted-foreground" /> : null}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{p.blurb}</p>
      <p className="mt-4"><span className="font-display text-3xl tabular-nums">{p.count}</span> <span className="text-sm text-muted-foreground">{p.unit}{p.count === 1 ? "" : "s"} made</span></p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--studio-gold)]">{p.cta} <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
    </Link>
  );
}

function PlanCard({ s }: { s: HubSummary }) {
  const ends = s.plan.offerEndsAt ? new Date(s.plan.offerEndsAt) : null;
  return (
    <aside aria-labelledby="plan" className={`${card} h-fit p-5`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Your plan</p>
      <h2 id="plan" className="font-display mt-1 text-xl font-semibold">{s.plan.label}</h2>
      <dl className="mt-4 space-y-2 text-sm">
        <Row k="Ozzy credits" v={s.wallet.credits} />
        <Row k="Free Studio videos" v={s.wallet.freeStudioVideos} />
        {s.wallet.testimonialVideos !== null ? <Row k="Testimonial videos" v={s.wallet.testimonialVideos} /> : null}
      </dl>
      {s.plan.kind === "studio_offer" ? (
        <div className="mt-4 rounded-2xl border border-[var(--studio-gold)]/40 p-3 text-sm">
          <p className="font-display font-semibold">{STUDIO_LAUNCH_OFFER.name}</p>
          <p className="mt-1 text-muted-foreground">{s.plan.line}</p>
          {ends ? <p className="mt-1 text-xs text-muted-foreground">Ends {ends.toLocaleString("en-AU", { weekday: "short", hour: "numeric", minute: "2-digit" })}</p> : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{s.plan.line}</p>
      )}
      <Link href={s.plan.cta.href} className="spellbar__cta mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl px-4 text-sm font-semibold">{s.plan.cta.label}</Link>
      {s.plan.kind === "legacy" ? <Link href="/ads/billing" className="mt-2 block text-center text-xs text-muted-foreground hover:text-foreground">Ozzy plans and credit wallet</Link> : null}
    </aside>
  );
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-display text-lg tabular-nums">{v}</dd>
    </div>
  );
}
