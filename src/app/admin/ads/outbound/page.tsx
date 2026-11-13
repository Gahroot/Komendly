/* eslint-disable @next/next/no-img-element -- token-checked streamed gift thumbnails */
import Link from "next/link";
import { ChevronDown, Crown, Mail, MessageCircle, Sparkles, Wallet } from "lucide-react";
import { OzzyLazy } from "@/components/ozzy/OzzyLazy";
import { StudioSky } from "@/components/studio/studio-sky";
import { ago, pct, plural, usd, type Freshness } from "@/lib/kly/aggregate";
import { loadKlyDashboard } from "@/lib/kly/queries";
import { getAdminUser } from "@/lib/ads/billing-auth";
import { cn } from "@/lib/utils";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { KlyChart } from "./_components/kly-chart";
import { KlySettingsDrawer } from "./_components/kly-settings-drawer";
import { KlyStage } from "./_components/kly-stage";

export const dynamic = "force-dynamic";

const FRESH: Record<Freshness, { label: string; dot: string }> = {
  live: { label: "Kly is awake", dot: "bg-emerald-400" },
  stale: { label: "Kly is slow to check in", dot: "bg-amber-400" },
  down: { label: "Kly has gone quiet", dot: "bg-red-400" },
  never: { label: "Waiting for Kly's first heartbeat", dot: "bg-muted-foreground" },
};

const KIND: Record<string, string> = { sent: "Sent", reply: "Reply", signup: "Signed up", paid: "Paid" };

function Panel({ title, kicker, children, className }: { title: string; kicker?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-3xl border border-[var(--studio-gold)]/15 bg-[oklch(0.2_0.07_295/0.62)] p-5 shadow-[inset_0_1px_0_#ffffff12,0_24px_60px_-24px_#000c] sm:p-6", className)}>
      {kicker && <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]/80">{kicker}</p>}
      <h2 className="font-display mt-1 text-xl font-medium tracking-[-0.015em] sm:text-2xl">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function Stat({ label, value, hint, gold }: { label: string; value: string; hint?: string; gold?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-white/[0.03] p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("font-display mt-1 text-2xl font-medium tabular-nums sm:text-3xl", gold && "text-[var(--studio-gold)]")}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function KlyPage() {
  // The shell renders "Admin access required" for non-admins; skip the queries for them.
  const admin = await getAdminUser();
  if (!admin) return <AdminAdsShell title="Kly">{null}</AdminAdsShell>;
  const d = await loadKlyDashboard();
  const { money: m, health: h } = d;
  const fresh = FRESH[h.heartbeat];
  const sendingOn = d.settings.enabled && h.killSwitchOn;
  return (
    <AdminAdsShell title="Kly" description="Ozzy's autonomous cold-email service: finds local businesses, gifts each an ad, emails, replies and learns. You just watch.">
      <KlyStage>
        <div className="relative -mx-4 -mt-4 h-[17rem] overflow-hidden sm:-mx-6 sm:h-64">
          <StudioSky />
          <div className="absolute inset-x-4 top-5 flex items-start justify-between gap-3 sm:inset-x-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Customer acquisition · on autopilot</p>
              <h2 className="font-display mt-1 text-4xl font-medium tracking-[-0.025em] sm:text-5xl">Kly</h2>
              <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-black/20 px-3 py-1 text-xs">
                <span className={cn("size-2 rounded-full", fresh.dot)} aria-hidden />
                {fresh.label}{h.heartbeatAt ? ` · ${ago(h.heartbeatAt, d.now)}` : ""}
              </p>
            </div>
            <KlySettingsDrawer settings={d.settings} killSwitchOn={h.killSwitchOn} mailboxes={h.mailboxes.map((x) => ({ id: x.id, address: x.address, paused: x.paused, pausedReason: x.pausedReason }))} />
          </div>
          <div className="absolute bottom-3 left-4 flex items-end gap-2 sm:left-6">
            <OzzyLazy size={84} perch="ledge" speech={false} pose={{ form: "classic", expression: d.money.payingCustomers > 0 ? "happy" : "neutral", motion: "wave" }} />
            <p role="status" className="ozzy-say relative mb-12 w-max max-w-[min(17rem,calc(100vw-10rem))] rounded-xl border-2 border-[#1a0f3a] bg-[#fff1d6] px-3 py-1.5 text-[13px] font-semibold leading-snug text-[#2a1a6e] shadow-[0_3px_0_#1a0f3a]">{d.ozzy}</p>
          </div>
        </div>

        <div className="relative mt-6 space-y-6">
          <Panel kicker="The money" title={m.revenueAllCents > 0 ? `${usd(m.revenueAllCents)} earned from Kly customers` : "No revenue from Kly yet"}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat gold label="Revenue this month" value={usd(m.revenueMonthCents)} hint={`${usd(m.revenueAllCents)} all time`} />
              <Stat label="Paying customers" value={String(m.payingCustomers)} hint={`${plural(m.signups, "signup")}`} />
              <Stat label="Spent (AI + ads)" value={usd(m.costMonthCents)} hint={`${usd(m.costAllCents)} all time`} />
              <Stat gold={m.roi !== null && m.roi > 0} label="ROI" value={m.roi === null ? "—" : `${m.roi >= 0 ? "+" : ""}${Math.round(m.roi * 100)}%`} hint={m.costPerPayingCents === null ? "No paying customers yet" : `${usd(m.costPerPayingCents)} per paying customer`} />
            </div>
          </Panel>

          <Panel kicker="The funnel" title="From found to paid">
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {d.funnel.map((s, i) => (
                <li key={s.key} className="studio-rise relative rounded-2xl border border-border bg-white/[0.03] p-3" style={{ ["--rise-delay" as string]: `${i * 60}ms` }}>
                  <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  <p className={cn("font-display text-2xl tabular-nums", (s.key === "paid" || s.key === "signedUp") && s.count > 0 && "text-[var(--studio-gold)]")}>{s.count}</p>
                  <p className="text-[11px] text-muted-foreground">{i === 0 ? "everyone Kly found" : `${pct(s.fromPrev)} of prev`}</p>
                </li>
              ))}
            </ol>
            <div className="mt-5">
              {d.hasDaily ? <KlyChart data={d.chart} /> : <Empty>No daily rollups yet. Kly writes one each day once it&apos;s running; the 30-day chart appears here.</Empty>}
            </div>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel kicker="Kly's journal" title="What Kly changed and why">
              {d.decisions.length === 0 ? <Empty>No decisions yet. When Kly scales up, retires an arm or pauses a mailbox, it explains itself here.</Empty> : (
                <ol className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                  {d.decisions.map((x) => (
                    <li key={x.id} className="flex gap-3">
                      <span className="mt-1 size-2 shrink-0 rounded-full bg-[var(--studio-gold)]" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-sm leading-snug">{x.summary}</p>
                        <p className="text-[11px] text-muted-foreground"><span className="font-mono uppercase">{x.kind.replace(/_/g, " ")}</span> · {ago(x.createdAt, d.now)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>

            <Panel kicker="Experiments" title="What's winning">
              {d.arms.length === 0 ? <Empty>No experiment arms yet. Kly seeds them on its first run.</Empty> : (
                <div className="space-y-5">
                  {d.arms.map((g) => (
                    <div key={g.dimension}>
                      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{g.dimension.replace(/_/g, " ")}</p>
                      <ul className="mt-2 space-y-1.5">
                        {g.live.map((a) => (
                          <li key={a.id} className={cn("flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm", a.status === "champion" ? "border-[var(--studio-gold)]/50 bg-[var(--studio-gold)]/[0.07]" : "border-border")}>
                            <span className="flex min-w-0 items-center gap-2">
                              {a.status === "champion" && <Crown className="size-4 shrink-0 text-[var(--studio-gold)]" aria-label="Champion" />}
                              <span className="truncate" title={a.rationale ?? undefined}>{a.key}</span>
                              {a.origin === "ai" && <Sparkles className="size-3.5 shrink-0 text-[var(--studio-cyan)]" aria-label="Bred by Kly" />}
                            </span>
                            <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">{a.sends} sent · {pct(a.replyRate)} reply · {a.signups} signup{a.signups === 1 ? "" : "s"}</span>
                          </li>
                        ))}
                      </ul>
                      {g.retired.length > 0 && (
                        <details className="mt-1.5 text-xs text-muted-foreground">
                          <summary className="flex cursor-pointer items-center gap-1 py-1"><ChevronDown className="size-3.5" />{g.retired.length} retired</summary>
                          <ul className="mt-1 space-y-1 pl-5">{g.retired.map((a) => <li key={a.id}>{a.key} · {a.sends} sent · {pct(a.replies / Math.max(1, a.sends))} reply</li>)}</ul>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <Panel kicker="Health" title={sendingOn ? "Sending is switched on" : "Sending is switched off"}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Kly worker" value={h.heartbeat === "never" ? "—" : h.heartbeatOk === false ? "Error" : h.heartbeat === "live" ? "OK" : h.heartbeat} hint={h.heartbeatMessage ?? (h.heartbeatAt ? `seen ${ago(h.heartbeatAt, d.now)}` : "no heartbeat yet")} />
              <Stat label="Codex" value={h.codex ? (!h.codex.ok ? "Error" : h.codex.freshness === "live" ? "OK" : "Last OK") : "—"} hint={h.codex ? (h.codex.message ?? `seen ${ago(h.codex.at, d.now)}`) : "no provider heartbeat yet"} />
              <Stat label="Budget this month" value={h.budget.pct === null ? usd(h.budget.spentCents) : pct(h.budget.pct, 0)} hint={`${usd(h.budget.spentCents)} of ${usd(h.budget.budgetCents)}${h.budget.over ? " · cap reached" : ""}`} />
              <Stat label="Switches" value={sendingOn ? "On" : "Off"} hint={`Kill switch ${h.killSwitchOn ? "allows" : "blocks"} · Kly ${d.settings.enabled ? "enabled" : "disabled"} · OUTBOUND_ENABLED ${h.outboundEnabled === null ? "unknown" : h.outboundEnabled ? "on" : "off"}`} />
            </div>
            <div className="mt-4 space-y-2">
              {h.mailboxes.length === 0 ? <Empty>Waiting for mailboxes. Kly sends nothing until one is set up on the worker.</Empty> : h.mailboxes.map((x) => (
                <div key={x.id} className="grid gap-2 rounded-2xl border border-border p-3 text-sm sm:grid-cols-[1.5fr_1fr_1fr_1fr] sm:items-center">
                  <span className="flex min-w-0 items-center gap-2"><Mail className="size-4 shrink-0 text-muted-foreground" /><span className="truncate">{x.address}</span></span>
                  <span className="tabular-nums">
                    {x.sentToday}/{x.limit} today
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-[var(--studio-gold)]" style={{ width: `${Math.min(100, x.limit ? (x.sentToday / x.limit) * 100 : 0)}%` }} /></span>
                  </span>
                  <span className="text-xs text-muted-foreground">{x.provider === "gmail" ? `Warm-up day ${x.warmupDay}` : x.status === "warming" ? "Warming at Maildoso" : x.provider} · cap {x.cap}<br />Bounce {pct(x.bounceRate)} · complaints {pct(x.complaintRate)}</span>
                  <span className={cn("w-fit rounded-full px-2.5 py-0.5 text-xs", x.paused || x.risk ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300")}>{x.paused ? `Paused${x.pausedReason ? `: ${x.pausedReason}` : ""}` : x.risk ? `At risk: ${x.risk}` : "Healthy"}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel kicker="Mailboxes" title={`${h.fleet.live} of ${plural(h.fleet.total, "mailbox")} sending`}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat gold label="Sent today" value={`${h.fleet.sentToday}/${h.fleet.capacity}`} hint="cold emails vs today's capacity" />
              <Stat label="Live" value={String(h.fleet.live)} hint="ready and unpaused" />
              <Stat label="Warming" value={String(h.fleet.warming)} hint={h.fleet.nextReadyAt ? `next ready ${h.fleet.nextReadyAt.toISOString().slice(0, 10)}` : "Maildoso warms 14 days first"} />
              <Stat label="Paused" value={String(h.fleet.paused)} hint={h.fleet.pausedWhy.length ? h.fleet.pausedWhy.slice(0, 3).map(([why, n]) => `${why} ${n}`).join(" · ") : "none paused"} />
            </div>
            {h.domains.length > 0 && (
              <ul className="mt-4 max-h-[22rem] space-y-1.5 overflow-y-auto pr-1">
                {h.domains.map((x) => (
                  <li key={x.domain} className="grid gap-2 rounded-xl border border-border px-3 py-2 text-sm sm:grid-cols-[1.4fr_1fr_1.2fr_1fr] sm:items-center">
                    <span className="truncate">{x.domain}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{x.live}/{x.mailboxes} live · {x.sentToday}/{x.cap} today</span>
                    <span className="text-xs text-muted-foreground">{(["mx", "spf", "dkim", "dmarc"] as const).map((k) => `${k.toUpperCase()} ${x.dns[k] === null ? "?" : x.dns[k] ? "ok" : "missing"}`).join(" · ")}{x.checkedAt ? ` · checked ${ago(x.checkedAt, d.now)}` : ""}</span>
                    <span className={cn("w-fit rounded-full px-2.5 py-0.5 text-xs", x.paused || x.listedOn.length ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300")} title={x.note ?? undefined}>{x.paused ? `Paused${x.pausedReason ? `: ${x.pausedReason}` : ""}` : x.listedOn.length ? `Listed: ${x.listedOn.join(", ")}` : "Healthy"}</span>
                  </li>
                ))}
              </ul>
            )}
            {h.warmup.mailboxes > 0 && (
              <div className="mt-5 border-t border-border pt-4">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-medium">Warm-up {h.warmup.enabled ? "" : "(switched off)"}</h3>
                  <span className="text-xs text-muted-foreground">{h.warmup.perDay}/day per mailbox · peer-to-peer, no vendor</span>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat gold label="Warm-up today" value={String(h.warmup.sentToday)} hint={`${plural(h.warmup.mailboxes, "mailbox")} warming each other`} />
                  <Stat label="Inbox placement" value={h.warmup.inboxPct === null ? "-" : pct(h.warmup.inboxPct)} hint="last 7 days, inbox vs spam" />
                  <Stat label="Ready / warming" value={`${h.warmup.ready} / ${h.warmup.warming}`} hint="ready = 14+ days and spam under the limit" />
                  <Stat label="Paused (spam)" value={String(h.warmup.paused)} hint="cold paused, warm-up keeps running" />
                </div>
                <ul className="mt-3 space-y-1.5">
                  {h.warmup.domains.map((x) => (
                    <li key={x.domain} className="grid gap-2 rounded-xl border border-border px-3 py-2 text-sm sm:grid-cols-[1.4fr_1fr_1fr_1.2fr] sm:items-center">
                      <span className="truncate">{x.domain}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{x.sentToday} sent today</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{x.inboxPct === null ? "no placement yet" : `${pct(x.inboxPct)} inbox`} · day {x.minDays}</span>
                      <span className={cn("w-fit rounded-full px-2.5 py-0.5 text-xs", x.paused ? "bg-red-500/15 text-red-300" : x.ready === x.mailboxes ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300")}>{x.ready} ready · {x.warming} warming{x.paused ? ` · ${x.paused} paused` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          <Panel kicker="Voice" title={d.settings.voiceEnabled ? "AI calls are switched on" : "AI calls are switched off"}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat label="Pushed today" value={String(d.voice.pushed)} hint={`cap ${d.settings.dailyCallCap}/day · ${d.settings.hourlyCallCap}/h`} />
              <Stat label="Accepted" value={String(d.voice.accepted)} hint={d.voice.rejected.length ? `rejected: ${d.voice.rejected.map((r) => `${r.reason.replace(/_/g, " ")} ${r.count}`).join(", ")}` : "none rejected"} />
              <Stat label="Called" value={String(d.voice.called)} />
              <Stat gold={d.voice.giftYes > 0} label="Said yes to the gift" value={String(d.voice.giftYes)} />
              <Stat label="Phone opt-outs" value={String(d.voice.optOuts)} />
            </div>
          </Panel>

          <Panel kicker="Recent activity" title="Who Kly is talking to">
            {d.activity.length === 0 ? <Empty>Nothing yet. Sends, replies, signups and payments will show up here as they happen.</Empty> : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {d.activity.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 rounded-2xl border border-border bg-white/[0.02] p-2.5">
                    <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-white/5">
                      {a.thumb ? <img src={a.thumb} alt="" width={56} height={56} loading="lazy" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-muted-foreground">{a.kind === "reply" ? <MessageCircle className="size-5" /> : a.kind === "paid" ? <Wallet className="size-5" /> : <Mail className="size-5" />}</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", a.kind === "paid" || a.kind === "signup" ? "bg-[var(--studio-gold)] text-[#2a0f10]" : a.kind === "reply" ? "bg-[var(--studio-cyan)]/15 text-[var(--studio-cyan)]" : "bg-white/10")}>{KIND[a.kind]}</span>
                        {a.giftToken ? <Link href={`/gift/${a.giftToken}`} target="_blank" className="truncate font-medium hover:underline">{a.business}</Link> : <span className="truncate font-medium">{a.business}</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{ago(a.at, d.now)}{a.qualityScore !== null ? ` · ad ${a.qualityScore}/10` : ""}{a.detail ? ` · ${a.detail}` : ""}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </KlyStage>
    </AdminAdsShell>
  );
}
