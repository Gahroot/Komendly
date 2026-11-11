import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminUser } from "@/lib/ads/billing-auth";
import { formatCents, formatPct } from "@/lib/ads/billing-format";
import { loadHq } from "@/lib/hub/hq-queries";
import { StatCard } from "./ads/_components/stat-card";
import { OzzyLazy } from "@/components/ozzy/OzzyLazy";

export const metadata: Metadata = { title: "Ozzy HQ" };
export const dynamic = "force-dynamic";

export default async function OzzyHq() {
  const admin = await getAdminUser();
  if (!admin) return <p className="text-destructive">Admin access required.</p>;
  const h = await loadHq(new Date());
  const name = "Nolan"; // the owner is the only admin
  const mrr = h.money.adsMrrCents + h.money.legacyMrrCents;
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex items-end gap-4">
        <OzzyLazy size={72} perch="ledge" speech={false} pose={{ form: "classic", expression: "happy", motion: "wave" }} />
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Ozzy HQ</p>
          <h1 className="text-3xl font-semibold tracking-tight">G&apos;day {name}</h1>
          <p className="text-sm text-muted-foreground">Everything across Ad Packs, Ozzy Studio and Testimonials. Real numbers, test sign-ups filtered out.</p>
        </div>
      </header>

      <Section title="Needs your attention">
        {h.attention.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {h.attention.map((a) => (
              <li key={a.key}>
                <Link href={a.href} className="glass-subtle flex items-center gap-3 rounded-xl p-3 text-sm hover:bg-accent/50">
                  <AlertTriangle aria-hidden className={a.tone === "bad" ? "size-4 text-destructive" : "size-4 text-[var(--warning)]"} />
                  <span className="flex-1">{a.label}</span>
                  <span className="font-semibold tabular-nums">{a.count}</span>
                  <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="glass-subtle flex items-center gap-2 rounded-xl p-3 text-sm"><CheckCircle2 aria-hidden className="size-4 text-[var(--success)]" /> All clear. Nothing needs you right now.</p>
        )}
      </Section>

      <Section title="Growth" more={{ href: "/admin/ads/signups", label: "Sign-ups" }}>
        <Grid>
          <StatCard label="Sign-ups today / 7d / 30d" value={`${h.signups.today} / ${h.signups.d7} / ${h.signups.d30}`} hint="Bot and test emails excluded" />
          <StatCard label="Ad Pack trials started / finished (30d)" value={`${h.trials.started30d} / ${h.trials.finished30d}`} hint={`${h.trials.startedWindows.today} today · ${h.trials.startedWindows.d7} in 7d`} />
          <StatCard label="Studio sessions today / 7d / 30d" value={`${h.studio.sessions.today} / ${h.studio.sessions.d7} / ${h.studio.sessions.d30}`} />
          <StatCard label="Studio renders (30d)" value={String(h.studio.renders30d)} hint={`${h.studio.freeRenders30d} were free videos`} />
        </Grid>
      </Section>

      <Section title="Money" more={{ href: "/admin/revenue", label: "Revenue" }}>
        <Grid>
          <StatCard label="MRR (both billing systems)" value={formatCents(mrr)} hint={`Ozzy plans ${formatCents(h.money.adsMrrCents)} · legacy testimonials ${formatCents(h.money.legacyMrrCents)} (list prices)`} />
          <StatCard label="Paying subscribers" value={String(h.money.adsSubscribers + h.money.legacySubscribers)} hint={`${h.money.adsSubscribers} Ozzy · ${h.money.legacySubscribers} legacy`} />
          <StatCard label="Revenue, last 30d" value={formatCents(h.money.revenue30dCents)} hint="Estimate: MRR + top-ups + testimonial packs" />
          <StatCard label="Paid conversions (30d)" value={String(h.money.paidConversions30d)} hint={`Trial → paid ${formatPct(h.money.trialToPaid)}`} />
        </Grid>
      </Section>

      <Section title="Usage and cost (30d)">
        <Grid>
          <StatCard label="Credits spent: Ad Packs" value={String(h.credits30d.ads)} hint={`Engine cost $${h.engine.cost30dUsd.toFixed(2)}`} />
          <StatCard label="Credits spent: Studio" value={String(h.credits30d.studio)} />
          <StatCard label="Testimonial videos" value={String(h.testimonials.videos30d)} hint={`${h.credits30d.testimonialVideos} minutes charged`} />
          <StatCard label="Testimonial vendor cost" value={`$${h.testimonials.costUsd30d.toFixed(2)}`} hint={h.testimonials.videos30d ? `$${(h.testimonials.costUsd30d / h.testimonials.videos30d).toFixed(2)} per video` : undefined} tone={h.testimonials.costUsd30d > 0 ? "bad" : "default"} />
        </Grid>
      </Section>

      <Section title="Engine" more={{ href: "/admin/ads/engine", label: "Engine" }}>
        <Card>
          <CardContent className="space-y-2 pt-6 text-sm">
            <p>
              Codex:{" "}
              {h.engine.codex ? (
                <span className={h.engine.codex.ok ? "text-[var(--success)]" : "text-destructive"}>{h.engine.codex.ok ? "logged in" : h.engine.codex.message ?? "not ok"}</span>
              ) : (
                <span className="text-muted-foreground">no heartbeat yet</span>
              )}
            </p>
            {h.engine.workers.length ? (
              <ul className="space-y-1">
                {h.engine.workers.map((w) => (
                  <li key={w.id} className="flex items-center gap-2">
                    <span aria-hidden className={`size-2 rounded-full ${w.live && w.ok ? "bg-[var(--success)]" : "bg-destructive"}`} />
                    <span className="font-mono text-xs">{w.id}</span>
                    <span className="text-muted-foreground">{w.live ? (w.ok ? "live" : "unhealthy") : "stale"} · {new Date(w.updatedAt).toLocaleString("en-AU")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No worker heartbeats.</p>
            )}
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}

function Section({ title, more, children }: { title: string; more?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {more ? <Link href={more.href} className="text-sm text-primary hover:underline">{more.label} <ArrowRight aria-hidden className="inline size-3.5" /></Link> : null}
      </div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}
