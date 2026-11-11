"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { postJson } from "@/lib/ads/run-client";

const ROLES = [
  { v: "web designer", l: "Web designer" },
  { v: "freelancer", l: "Freelancer (marketing, social, copy)" },
  { v: "agency", l: "Agency" },
  { v: "other", l: "Something else" },
];
const METHODS = [
  { v: "paypal", l: "PayPal" },
  { v: "wise", l: "Wise" },
  { v: "bank", l: "Bank transfer" },
  { v: "other", l: "Other" },
];
const SELECT = "h-10 w-full rounded-md border border-input bg-background/60 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PartnerApplyForm({ defaultEmail }: { defaultEmail: string }) {
  const [f, setF] = useState({ company: "", website: "", role: "web designer", clientCount: "", pitch: "", payoutEmail: defaultEmail, payoutMethod: "paypal" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/ads/partner/apply", { ...f, clientCount: Number(f.clientCount || 0) });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4 text-center" role="status">
        <CheckCircle2 className="mx-auto size-10 text-[var(--studio-gold)]" />
        <h2 className="font-display text-2xl font-medium">Application received</h2>
        <p className="text-sm text-muted-foreground">We review every application by hand, usually within 2 business days. You&apos;ll get an email with your partner link as soon as you&apos;re approved.</p>
        <Button asChild size="lg"><Link href="/ads/app">Meanwhile, make your own free ads</Link></Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="company">Company or studio name</Label><Input id="company" autoComplete="organization" value={f.company} onChange={set("company")} placeholder="Optional" /></div>
        <div className="space-y-2"><Label htmlFor="website">Your website or portfolio</Label><Input id="website" inputMode="url" autoComplete="url" value={f.website} onChange={set("website")} placeholder="yourstudio.com" /></div>
        <div className="space-y-2"><Label htmlFor="role">What do you do?</Label><select id="role" className={SELECT} value={f.role} onChange={set("role")}>{ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="clients">Small-business clients you work with</Label><Input id="clients" type="number" min={0} max={100000} inputMode="numeric" required value={f.clientCount} onChange={set("clientCount")} placeholder="e.g. 12" /></div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pitch">How will you share Komendly?</Label>
        <Textarea id="pitch" required minLength={10} rows={3} value={f.pitch} onChange={set("pitch")} placeholder="e.g. I'll send demo packs to clients after their site launches, and mention it in my newsletter." />
      </div>
      <fieldset className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-medium">Payouts</legend>
        <div className="space-y-2"><Label htmlFor="payoutMethod">Method</Label><select id="payoutMethod" className={SELECT} value={f.payoutMethod} onChange={set("payoutMethod")}>{METHODS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="payoutEmail">Payout email</Label><Input id="payoutEmail" type="email" required value={f.payoutEmail} onChange={set("payoutEmail")} /></div>
        <p className="text-xs text-muted-foreground sm:col-span-2">Paid monthly once you&apos;re owed $50 or more, after each payment&apos;s 30-day refund window.</p>
      </fieldset>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Send my application</Button>
      <p className="text-center text-xs text-muted-foreground">By applying you agree to the partner terms on <Link href="/partners#faq-title" className="underline underline-offset-4">the partner page</Link>. No self-referrals.</p>
    </form>
  );
}
