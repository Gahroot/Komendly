"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetaAccountPicker } from "@/components/ads/meta-account-picker";
import { NO_AD_ACCOUNT_HELP } from "@/lib/ads/meta/readiness";
import { SUGGESTED_MONTHLY_LIMIT_MINOR, authorizationText, dailyBudgetMinor, formatMoney, parseMandateInput } from "@/lib/ads/team/contracts";
import type { TeamStatus } from "@/lib/ads/team/rules";
import { cn } from "@/lib/utils";
import { BudgetFields, budgetBody, type BudgetForm } from "./budget-fields";
import { OzzyImg } from "./team-bits";
import { openMetaConnect, teamFetch } from "./team-app";

type Step = 1 | 2 | 3;
const STEPS: Array<{ n: Step; label: string }> = [{ n: 1, label: "Connect Meta" }, { n: 2, label: "Area & budget" }, { n: 3, label: "Hire the team" }];

export function TeamSetup({ status, refresh, loading }: { status: TeamStatus; refresh: () => Promise<void>; loading: boolean }) {
  const metaReady = status.meta.connected && !!status.meta.selection?.adAccountId && !!status.meta.selection?.pageId && status.meta.readiness?.ok === true;
  const [step, setStep] = useState<Step>(metaReady ? 2 : 1);
  const [form, setForm] = useState<BudgetForm>({ monthlyLimit: String(SUGGESTED_MONTHLY_LIMIT_MINOR / 100), zips: "", leadEmail: status.ownerEmail, privacyUrl: "" });
  const check = parseMandateInput({ ...budgetBody(form), agreed: true });

  return (
    <div className="space-y-6">
      <section className="studio-rise flex items-center gap-4">
        <OzzyImg src="/brand/ozzy-classic-happy.png" size={88} />
        <div className="space-y-1">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--studio-gold)]">Your marketing team</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">G&apos;day! Three quick steps and the team gets to work.</h1>
        </div>
      </section>

      <ol className="grid grid-cols-3 gap-2" aria-label="Setup steps">
        {STEPS.map((s) => (
          <li key={s.n}>
            <button type="button" onClick={() => setStep(s.n)} disabled={(s.n > 1 && !metaReady) || (s.n === 3 && !check.ok)} aria-current={step === s.n ? "step" : undefined}
              className={cn("w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50", step === s.n ? "border-[var(--studio-gold)] bg-[var(--studio-gold)]/10" : "border-border bg-card/50")}>
              <span className="block font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Step {s.n}</span>
              <span className="font-medium">{s.label}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 1 && <ConnectStep status={status} refresh={refresh} loading={loading} ready={metaReady} onNext={() => setStep(2)} />}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Where you work and what you can spend</CardTitle>
            <CardDescription>The team only shows ads in your area and stays inside your limit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <BudgetFields value={form} onChange={setForm} currency={status.meta.currency} />
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Not for housing, loans, credit, insurance, jobs or politics: Meta restricts those ads, so the team doesn&apos;t run them.</p>
            {!check.ok && (form.zips || form.monthlyLimit !== String(SUGGESTED_MONTHLY_LIMIT_MINOR / 100)) && <p className="text-sm text-destructive" role="alert">{check.error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button className="spellbar__cta" disabled={!check.ok} onClick={() => setStep(3)}>Next: review</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {step === 3 && check.ok && <AuthorizeStep status={status} form={form} limitMinor={check.value.monthlyLimitMinor} zips={check.value.zips} onBack={() => setStep(2)} refresh={refresh} />}
    </div>
  );
}

function ConnectStep({ status, refresh, loading, ready, onNext }: { status: TeamStatus; refresh: () => Promise<void>; loading: boolean; ready: boolean; onNext: () => void }) {
  const { meta } = status;
  const [adAccountId, setAdAccountId] = useState(meta.selection?.adAccountId ?? "");
  const [pageId, setPageId] = useState(meta.selection?.pageId ?? "");
  const [saving, setSaving] = useState(false);
  const save = async (acc: string, page: string) => {
    if (!acc || !page) return;
    setSaving(true);
    const r = await teamFetch("/api/ads/meta/selection", { method: "POST", body: JSON.stringify({ adAccountId: acc, pageId: page }) });
    if (!r.ok) toast.error(r.error);
    await refresh();
    setSaving(false);
  };
  const disconnect = async () => {
    await teamFetch("/api/ads/meta/disconnect", { method: "POST" });
    setAdAccountId(""); setPageId("");
    await refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your Facebook and Instagram ads</CardTitle>
        <CardDescription>Use the Facebook login that manages your business&apos;s ads account and Facebook Page.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {meta.access === "disabled" && meta.partner.offered && !meta.connected ? (
          <FoundingSetup status={status} refresh={refresh} />
        ) : meta.access === "disabled" ? (
          <p role="status" className="rounded-lg border border-border bg-muted/50 px-3 py-2">
            Meta is still reviewing Komendly&apos;s access, so connecting is switched on one account at a time for now. Write to{" "}
            <a className="text-primary underline-offset-4 hover:underline" href="mailto:nolan@komendly.com">nolan@komendly.com</a> and we&apos;ll switch it on for you.
          </p>
        ) : !meta.connected ? (
          <>
            <ul className="space-y-1 text-muted-foreground">
              <li>· The team creates and changes ads only in the ad account you pick.</li>
              <li>· Nothing runs until you hire the team in step 3.</li>
              <li>· Disconnecting later pauses your ads first.</li>
            </ul>
            <Button className="spellbar__cta" onClick={openMetaConnect}>Connect Meta</Button>
            <p className="text-xs text-muted-foreground">A Meta window opens. When you&apos;re done there, this page moves on by itself.</p>
            {meta.partner.offered && <FoundingSetup status={status} refresh={refresh} />}
          </>
        ) : meta.partner.viaPartner && !(meta.selection?.adAccountId && meta.selection?.pageId) ? (
          <p role="status" className="rounded-lg border border-border bg-muted/50 px-3 py-2">
            Your partner access is in. Komendly is picking your ad account and Facebook Page now; we&apos;ll email you when step 2 is ready.
          </p>
        ) : !meta.accounts ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading your Meta accounts" />
        ) : "error" in meta.accounts ? (
          <div className="space-y-3">
            <p className="text-destructive" role="alert">{meta.accounts.error}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void refresh()} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Try again</Button>
              <Button variant="ghost" onClick={() => void disconnect()}>Reconnect</Button>
            </div>
          </div>
        ) : (
          <>
            <MetaAccountPicker adAccounts={meta.accounts.adAccounts} pages={meta.accounts.pages} adAccountId={adAccountId} pageId={pageId}
              onAdAccount={(id) => { setAdAccountId(id); void save(id, pageId); }} onPage={(id) => { setPageId(id); void save(adAccountId, id); }} />
            <ReadinessList status={status} adAccountId={adAccountId} />
            {meta.accounts.adAccounts.length === 0 && (
              <div className="space-y-1 rounded-md bg-muted/50 px-3 py-2 text-muted-foreground">
                <p className="font-medium text-foreground">{NO_AD_ACCOUNT_HELP.title}</p>
                <p>{NO_AD_ACCOUNT_HELP.text}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button className="spellbar__cta" disabled={!ready || saving} onClick={onNext}>Next: area & budget</Button>
              <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading || saving}>{loading || saving ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check again</Button>
              <Button variant="ghost" size="sm" onClick={() => void disconnect()}>Disconnect</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Founding setup while Meta reviews Komendly: the owner adds Komendly's Business as a partner, then tells us. */
function FoundingSetup({ status, refresh }: { status: TeamStatus; refresh: () => Promise<void> }) {
  const { businessId, requested } = status.meta.partner;
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(requested);
  const tell = async () => {
    setSending(true);
    const r = await teamFetch("/api/ads/team/partner-request", { method: "POST" });
    setSending(false);
    if (!r.ok) { toast.error(r.error); return; }
    setSent(true);
    toast.success(businessId ? "Thanks! We'll connect your account and email you." : "Thanks! We'll email you our Business ID.");
    await refresh();
  };
  return (
    <div className="space-y-3 rounded-lg border border-[var(--studio-gold)]/40 bg-[var(--studio-gold)]/5 px-4 py-3">
      <p className="font-medium">Founding setup: give Komendly partner access</p>
      <p className="text-muted-foreground">
        Meta is still reviewing Komendly&apos;s app, so for our founding customers we set things up with you. You add Komendly as a partner
        in your Meta business portfolio and we connect the rest. You need full control of your business portfolio.
      </p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Open <a className="text-primary underline-offset-4 hover:underline" href="https://business.facebook.com/latest/settings" target="_blank" rel="noreferrer">Settings in Meta Business Suite</a>.</li>
        <li>Under <b>Users</b>, click <b>Partners</b>, then <b>Add</b> and <b>Give a partner access to your assets</b>.</li>
        {businessId
          ? <li>Enter Komendly&apos;s business portfolio ID: <code className="rounded bg-muted px-1 font-mono">{businessId}</code>, then click <b>Next</b>.</li>
          : <li>Enter Komendly&apos;s business portfolio ID. We&apos;ll send you our Business ID by email: click the button below.</li>}
        <li>Pick your <b>ad account</b> and allow <b>Manage campaigns</b> (manage ads).</li>
        <li>Pick your <b>Facebook Page</b> and allow <b>Create ads</b> and <b>Leads access</b>.</li>
        <li>Click <b>Assign assets</b>.</li>
      </ol>
      {sent
        ? <p role="status" className="flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" /> {businessId ? "Got it. We'll connect your account and email you when step 2 is ready." : "Got it. Watch your inbox for our Business ID."}</p>
        : <Button variant="outline" disabled={sending} onClick={() => void tell()}>{sending && <Loader2 className="animate-spin" />} {businessId ? "Tell us when done" : "Send me Komendly's Business ID"}</Button>}
    </div>
  );
}

function ReadinessList({ status, adAccountId }: { status: TeamStatus; adAccountId: string }) {
  const acc = status.meta.accounts;
  if (!acc || "error" in acc) return null;
  const r = acc.adAccounts.find((a) => a.id === adAccountId)?.readiness ?? acc.readiness;
  const picked = !!status.meta.selection?.adAccountId && !!status.meta.selection?.pageId;
  if (r.ok) return picked ? <p className="flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" /> This account is ready. Meta can charge it for ads.</p> : null;
  return (
    <ul className="space-y-2" aria-live="polite">
      {r.issues.map((i) => (
        <li key={i.code} className="flex gap-2 rounded-md border border-border bg-card/50 px-3 py-2">
          <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span className="space-y-1">
            <span className="block">{i.text}</span>
            <a className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline" href={i.fixUrl} target="_blank" rel="noreferrer">{i.fixLabel} <ExternalLink className="size-3.5" /></a>
          </span>
        </li>
      ))}
    </ul>
  );
}

function AuthorizeStep({ status, form, limitMinor, zips, onBack, refresh }: { status: TeamStatus; form: BudgetForm; limitMinor: number; zips: string[]; onBack: () => void; refresh: () => Promise<void> }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverText, setServerText] = useState<string | null>(null);
  const currency = status.meta.currency;
  const text = useMemo(() => serverText ?? authorizationText({ monthlyLimitMinor: limitMinor, currency, adAccountName: status.meta.adAccountName ?? "your ad account", businessName: status.businessName }), [serverText, limitMinor, currency, status.meta.adAccountName, status.businessName]);
  const hire = async () => {
    setBusy(true); setError(null);
    const r = await teamFetch("/api/ads/team/authorize", { method: "POST", body: JSON.stringify({ ...budgetBody(form), agreed: true, authorizationText: text }) });
    if (r.ok) { toast.success("You hired the team!"); await refresh(); return; }
    if (typeof r.data.authorizationText === "string") { setServerText(r.data.authorizationText); setAgreed(false); }
    setError(r.error); setBusy(false);
  };
  const daily = dailyBudgetMinor(limitMinor);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hire the team</CardTitle>
        <CardDescription>Here&apos;s exactly what happens next.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <ul className="space-y-2">
          <li>· Ads run on Facebook and Instagram from <b>{status.meta.pageName ?? "your Page"}</b>, paid from ad account <b>{status.meta.adAccountName ?? "you picked"}</b>.</li>
          <li>· Shown to adults in {zips.length} ZIP code{zips.length === 1 ? "" : "s"}: {zips.slice(0, 8).join(", ")}{zips.length > 8 ? "…" : ""}.</li>
          <li>· At most <b>{formatMoney(limitMinor, currency)}</b> a month (about {formatMoney(daily, currency)} a day), charged by Meta to your card. Your Komendly plan is billed separately.</li>
          <li>· New leads go to <b>{form.leadEmail}</b> within a minute.</li>
          <li>· The team sets up your lead form and campaign within about 15 minutes, then reports here what it did.</li>
        </ul>
        <blockquote className="rounded-xl border border-[var(--studio-gold)]/40 bg-[var(--studio-gold)]/5 p-4 font-display text-base leading-relaxed">{text}</blockquote>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--studio-gold)]" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>I agree. I authorize Komendly to run my ads as described above, spending at most {formatMoney(limitMinor, currency)} per calendar month.</span>
        </label>
        {error && <p className="text-destructive" role="alert">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} disabled={busy}>Back</Button>
          <Button className="spellbar__cta" disabled={!agreed || busy} onClick={() => void hire()}>{busy ? <Loader2 className="animate-spin" /> : null} Hire the team</Button>
        </div>
        <p className="text-xs text-muted-foreground">You can pause your ads or change the limit any time on this page.</p>
      </CardContent>
    </Card>
  );
}
