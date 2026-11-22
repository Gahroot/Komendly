"use client";

import { useState } from "react";
import { Loader2, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authorizationText, formatMoney, parseMandateInput, type LabeledNumber } from "@/lib/ads/team/contracts";
import { adAccountNameFromText, type TeamStatus } from "@/lib/ads/team/rules";
import { cn } from "@/lib/utils";
import { BudgetFields, budgetBody, type BudgetForm } from "./budget-fields";
import { CertaintyTag, OzzyImg, ROLE_OZZY, when } from "./team-bits";
import { openMetaConnect, teamFetch } from "./team-app";

const NEEDS_YOU = new Set(["blocked", "needs_reconnect", "capped"]);

export function TeamDashboard({ status, refresh, loading }: { status: TeamStatus; refresh: () => Promise<void>; loading: boolean }) {
  const m = status.mandate!;
  const n = status.numbers;
  const cur = m.currency;
  const money = (x: number) => formatMoney(x, cur);
  const [editing, setEditing] = useState<null | "update" | "resume">(null);
  const [busy, setBusy] = useState(false);
  const running = m.status === "active";

  const pause = async () => {
    setBusy(true);
    const r = await teamFetch("/api/ads/team", { method: "PATCH", body: JSON.stringify({ action: "pause" }) });
    if (r.ok) toast.success("Pausing your ads now."); else toast.error(r.error);
    await refresh(); setBusy(false);
  };

  return (
    <div className="space-y-6">
      <section className="studio-rise flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <OzzyImg src={NEEDS_YOU.has(m.state) ? "/brand/ozzy-classic-confused.png" : m.state === "live" ? "/brand/ozzy-joyful-happy.png" : "/brand/ozzy-classic-happy.png"} size={88} />
          <div className="space-y-1">
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--studio-gold)]">Ozzy, Marketing Director</p>
            <p role="status" className="font-display text-xl leading-snug sm:text-2xl">{status.statusLine}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {running
            ? <Button variant="outline" onClick={() => void pause()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Pause />} Pause my ads</Button>
            : status.isOwner && <Button className="spellbar__cta" onClick={() => setEditing("resume")}><Play /> Resume</Button>}
          {status.isOwner && <Button variant="ghost" onClick={() => setEditing(editing === "update" ? null : "update")}>Edit budget & ZIPs</Button>}
        </div>
      </section>

      {m.state === "needs_reconnect" && (
        <OwnerCard text={m.stateReason ?? "Meta is disconnected."}>
          <Button className="spellbar__cta" onClick={openMetaConnect}>Reconnect Meta</Button>
        </OwnerCard>
      )}
      {m.state === "blocked" && (
        <OwnerCard text={m.stateReason ?? "The team is waiting on something from you."}>
          {status.meta.readiness?.issues.map((i) => <a key={i.code} className="text-sm text-primary underline-offset-4 hover:underline" href={i.fixUrl} target="_blank" rel="noreferrer">{i.fixLabel}</a>)}
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>Check again</Button>
        </OwnerCard>
      )}

      {editing && <ChangeCard status={status} mode={editing} onDone={async () => { setEditing(null); await refresh(); }} onCancel={() => setEditing(null)} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="Spent this month" n={n?.spend} fmt={money} extra={`of your ${money(m.monthlyLimitMinor)} limit`} bar={n?.spend.value != null ? n.spend.value / m.monthlyLimitMinor : null} />
        <Stat title="Month-end spend" n={n?.projected} fmt={money} extra={n?.projected.note} />
        <Stat title="Leads received" n={n?.leadsReceived} fmt={String} extra={n?.metaLeads.value != null && n.metaLeads.value !== n.leadsReceived.value ? `Meta reports ${n.metaLeads.value}. The two can differ for a while: Meta updates its numbers with a delay, and a lead counts here once it reaches your inbox.` : "this month"} />
        <Stat title="Cost per lead" n={n?.costPerLead} fmt={money} extra={n?.costPerLead.note} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="space-y-3 lg:col-span-3">
          <h2 className="text-xl font-semibold">Your team</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {status.roster.map((r) => (
              <Card key={r.role} className="gap-2 py-4">
                <CardContent className="flex items-start gap-3 px-4">
                  <OzzyImg src={ROLE_OZZY[r.role]} size={44} />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold">{r.label}</p>
                    {r.latest
                      ? <p className="text-sm">{r.latest.summary} <span className="block text-xs text-muted-foreground">{when(r.latest.at)}</span></p>
                      : <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Nothing yet.</span> <span className="block">{r.next}</span></p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
        <section className="space-y-3 lg:col-span-2">
          <h2 className="text-xl font-semibold">What the team did</h2>
          <Card className="py-2">
            <CardContent className="px-4">
              {status.feed.length === 0 ? <p className="py-4 text-sm text-muted-foreground">Nothing yet. Every step the team takes shows up here, newest first.</p> : (
                <ol className="divide-y divide-border">
                  {status.feed.map((f) => (
                    <li key={f.id} className="py-3 text-sm">
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{f.roleLabel}</span>{when(f.at)}{f.outcome !== "done" && <span className="text-[var(--warning)]">{f.outcome === "failed" ? "didn't work" : "skipped"}</span>}</p>
                      <p>{f.summary}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <Leads status={status} refresh={refresh} />

      <Card className="gap-2">
        <CardHeader>
          <CardTitle className="text-base">What you agreed to</CardTitle>
          <CardDescription>{when(m.authorizedAt)} · terms version {m.termsVersion} · ZIPs {m.zips.join(", ")} · leads to {m.leadEmail}</CardDescription>
        </CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">{m.authorizationText}</p></CardContent>
      </Card>
    </div>
  );
}

function OwnerCard({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-[var(--studio-gold)]/60 bg-[var(--studio-gold)]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm"><span className="font-semibold">The team needs you: </span>{text}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function Stat({ title, n, fmt, extra, bar }: { title: string; n: LabeledNumber | undefined; fmt: (v: number) => string; extra?: string; bar?: number | null }) {
  const c = n?.certainty ?? "unknown";
  return (
    <Card className="gap-2 py-4">
      <CardContent className="space-y-2 px-4">
        <div className="flex items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{title}</p><CertaintyTag c={c} /></div>
        <p className="text-2xl font-semibold tabular-nums">{n?.value != null ? fmt(n.value) : "—"}</p>
        {bar != null && <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full bg-[var(--studio-gold)]" style={{ width: `${Math.min(100, Math.round(bar * 100))}%` }} /></div>}
        {(extra || (c === "unknown" && n?.note)) && <p className="text-xs text-muted-foreground">{extra ?? n?.note}</p>}
      </CardContent>
    </Card>
  );
}

function ChangeCard({ status, mode, onDone, onCancel }: { status: TeamStatus; mode: "update" | "resume"; onDone: () => Promise<void>; onCancel: () => void }) {
  const m = status.mandate!;
  const [form, setForm] = useState<BudgetForm>({ monthlyLimit: String(m.monthlyLimitMinor / 100), zips: m.zips.join(", "), leadEmail: m.leadEmail, privacyUrl: m.privacyUrl ?? "" });
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = parseMandateInput({ ...budgetBody(form), agreed: true });
  const text = check.ok ? authorizationText({ monthlyLimitMinor: check.value.monthlyLimitMinor, currency: m.currency, adAccountName: adAccountNameFromText(m.authorizationText) ?? status.meta.adAccountName ?? "your ad account", businessName: status.businessName }) : null;
  const save = async () => {
    setBusy(true); setError(null);
    const r = await teamFetch("/api/ads/team", { method: "PATCH", body: JSON.stringify({ action: mode, agreed: true, ...budgetBody(form) }) });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast.success(mode === "resume" ? "Turning your ads back on." : "Saved.");
    await onDone();
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "resume" ? "Turn your ads back on" : "Change your budget or area"}</CardTitle>
        <CardDescription>A lower limit counts at once. If you&apos;ve already spent more than it this month, the team pauses until the 1st.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <BudgetFields value={form} onChange={setForm} currency={m.currency} />
        {!check.ok && <p className="text-destructive" role="alert">{check.error}</p>}
        {text && <blockquote className="rounded-xl border border-[var(--studio-gold)]/40 bg-[var(--studio-gold)]/5 p-4 font-display text-base leading-relaxed">{text}</blockquote>}
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--studio-gold)]" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>I agree to the text above{check.ok ? `, spending at most ${formatMoney(check.value.monthlyLimitMinor, m.currency)} per calendar month` : ""}.</span>
        </label>
        {error && <p className="text-destructive" role="alert">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button className="spellbar__cta" disabled={!agreed || !check.ok || busy} onClick={() => void save()}>{busy && <Loader2 className="animate-spin" />}{mode === "resume" ? "Resume my ads" : "Save"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Leads({ status, refresh }: { status: TeamStatus; refresh: () => Promise<void> }) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const del = async (id: string) => {
    if (!window.confirm("Delete this lead from Komendly? This can't be undone.")) return;
    setDeleting(id);
    const r = await teamFetch(`/api/ads/team/leads/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!r.ok) toast.error(r.error);
    await refresh(); setDeleting(null);
  };
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Your leads</h2>
      {status.leads.length === 0 ? (
        <Card className="py-6"><CardContent className="text-sm text-muted-foreground">No leads yet. When someone fills in your ad&apos;s form, they appear here and in your inbox ({status.mandate?.leadEmail}) within a minute.</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {status.leads.map((l) => (
            <Card key={l.id} className="gap-2 py-4">
              <CardContent className="space-y-1 px-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{l.name ?? "Name not given"}</p>
                  <Button variant="ghost" size="icon" aria-label="Delete lead" onClick={() => void del(l.id)} disabled={deleting === l.id}>{deleting === l.id ? <Loader2 className="animate-spin" /> : <Trash2 />}</Button>
                </div>
                {l.phone && <p><a className="text-primary underline-offset-4 hover:underline" href={`tel:${l.phone}`}>{l.phone}</a></p>}
                {l.email && <p><a className="text-primary underline-offset-4 hover:underline" href={`mailto:${l.email}`}>{l.email}</a></p>}
                {l.zip && <p className="text-muted-foreground">ZIP {l.zip}</p>}
                {l.answers.filter((a) => a.text).map((a, i) => <p key={i} className="text-muted-foreground"><span className="text-foreground">{a.label}:</span> {a.text}</p>)}
                <p className={cn("text-xs text-muted-foreground")}>Received {when(l.receivedAt)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Leads are kept for 180 days, then deleted automatically.</p>
    </section>
  );
}
