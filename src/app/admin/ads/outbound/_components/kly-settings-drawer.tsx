"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { KlySettingsSchema, type KlySettingsInput } from "@/lib/kly/settings";
import { OutboundRunForm } from "../../_components/outbound-run-form";
import { InputActionForm } from "../../_components/input-action-form";
import { PostActionButton } from "../../_components/post-action-button";

const API = "/api/admin/ads/outbound";

type NumKey = { [K in keyof KlySettingsInput]: KlySettingsInput[K] extends number ? K : never }[keyof KlySettingsInput];
const NUMBERS: { key: NumKey; label: string; help: string }[] = [
  { key: "dailySendCeiling", label: "Daily send ceiling", help: "Emails per day across all mailboxes (0-1000)." },
  { key: "dailyGiftCap", label: "Daily gift cap", help: "Hook ads started per day (0-500)." },
  { key: "monthlyBudgetCents", label: "Monthly budget (cents)", help: "AI + generation spend cap per month." },
  { key: "maxCodexWeeklyPct", label: "Max Codex weekly %", help: "Stop new gifts above this share (0-100)." },
  { key: "minLeadScore", label: "Min lead score", help: "0-100 fit score to qualify." },
  { key: "minQualityScore", label: "Min ad quality", help: "0-10 judge score to send." },
  { key: "followUpDays", label: "Follow-up after (days)", help: "1-30." },
  { key: "maxSteps", label: "Max emails per lead", help: "1-3." },
  { key: "dailyCallCap", label: "Daily call cap", help: "Leads handed to The Tribunal per day (0-10000)." },
  { key: "hourlyCallCap", label: "Hourly call cap", help: "Call rate; ~1.5x is queued ahead (0-1000)." },
  { key: "explorationPct", label: "Exploration %", help: "Share of leads on new arms (0-50)." },
];
const TOGGLES: { key: "enabled" | "autoScale" | "autoReply" | "voiceEnabled"; label: string }[] = [
  { key: "enabled", label: "Kly enabled" },
  { key: "autoScale", label: "Auto-scale volume" },
  { key: "autoReply", label: "Auto-reply to prospects" },
  { key: "voiceEnabled", label: "AI voice calls (The Tribunal)" },
];

export interface DrawerMailbox { id: string; address: string; paused: boolean; pausedReason: string | null }

export function KlySettingsDrawer({ settings, killSwitchOn, mailboxes }: { settings: KlySettingsInput; killSwitchOn: boolean; mailboxes: DrawerMailbox[] }) {
  const router = useRouter();
  const [f, setF] = useState({ ...settings, countries: settings.targetCountries.join(", "), notesText: settings.notes ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { countries, notesText, ...rest } = f;
    const parsed = KlySettingsSchema.safeParse({ ...rest, targetCountries: countries.split(/[,\s]+/).map((c) => c.trim().toUpperCase()).filter(Boolean), notes: notesText.trim() || null });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid settings");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "settings", settings: parsed.data }) });
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.error ?? "Save failed");
      else {
        toast.success("Kly settings saved");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2"><Settings2 className="size-4" />Settings</Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">Kly&apos;s safeguards</SheetTitle>
          <SheetDescription>Kly reads these every tick. You rarely need to touch them.</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-8">
          <section className="space-y-2 rounded-2xl border border-border p-4">
            <h3 className="text-sm font-semibold">Kill switch</h3>
            <p className="text-xs text-muted-foreground">Sending is {killSwitchOn ? "allowed" : "stopped"}. It also needs OUTBOUND_ENABLED=1 on the worker.</p>
            <PostActionButton url={API} body={{ action: "kill_switch", enabled: !killSwitchOn }} label={killSwitchOn ? "Stop all sending" : "Allow sending"} variant={killSwitchOn ? "destructive" : "default"} confirm={{ title: killSwitchOn ? "Stop all outbound sending?" : "Allow outbound sending?", description: killSwitchOn ? "Every mailbox stops after the email in flight." : "Mailboxes send (paced, business hours) if the worker has OUTBOUND_ENABLED=1." }} />
          </section>
          <form onSubmit={save} className="space-y-4">
            {TOGGLES.map((t) => (
              <label key={t.key} className="flex min-h-10 items-center justify-between gap-3 text-sm">
                {t.label}
                <input type="checkbox" className="size-5 accent-[var(--studio-gold)]" checked={f[t.key]} onChange={(e) => setF({ ...f, [t.key]: e.target.checked })} />
              </label>
            ))}
            <div className="grid grid-cols-2 gap-3">
              {NUMBERS.map((n) => (
                <div key={n.key} className="space-y-1">
                  <Label htmlFor={`kly-${n.key}`} className="text-xs">{n.label}</Label>
                  <Input id={`kly-${n.key}`} type="number" inputMode="numeric" value={f[n.key]} onChange={(e) => setF({ ...f, [n.key]: e.target.value === "" ? 0 : Number(e.target.value) })} />
                  <p className="text-[11px] text-muted-foreground">{n.help}</p>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor="kly-countries" className="text-xs">Target countries</Label>
              <Input id="kly-countries" value={f.countries} onChange={(e) => setF({ ...f, countries: e.target.value })} placeholder="US, CA" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="kly-notes" className="text-xs">Notes for Kly</Label>
              <Textarea id="kly-notes" value={f.notesText} maxLength={500} onChange={(e) => setF({ ...f, notesText: e.target.value })} />
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">Save settings</Button>
          </form>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Mailboxes</h3>
            {mailboxes.length === 0 && <p className="text-xs text-muted-foreground">No mailboxes yet.</p>}
            {mailboxes.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{m.address}{m.paused && <span className="text-xs text-muted-foreground"> · paused{m.pausedReason ? `: ${m.pausedReason}` : ""}</span>}</span>
                {m.paused ? <PostActionButton url={API} body={{ action: "resume", mailboxId: m.id }} label="Resume" /> : <PostActionButton url={API} body={{ action: "pause", mailboxId: m.id }} label="Pause" variant="destructive" />}
              </div>
            ))}
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Find leads by hand</h3>
            <OutboundRunForm />
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Suppress an address or domain</h3>
            <InputActionForm url={API} body={{ action: "suppress" }} field="value" placeholder="email or domain" label="Suppress" variant="outline" required />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
