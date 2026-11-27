"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, KeyRound, Loader2, LogIn, PlusCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleApiError } from "@/lib/ads/google/client-api";
import { ErrorNote } from "./error-note";
import { GOOGLE_BILLING_URL, GOOGLE_MANAGERS_URL, HELP_PATH, formatCustomerId, normalizeCustomerId } from "./logic";

export type ConnectChoice = "have" | "new" | "id";

/** What we told them to do after creating or linking, so the next screens can repeat it. */
export type SetupNote =
  | { kind: "created"; email: string; billingUrl: string; customerId: string }
  | { kind: "linked"; customerId: string; acceptUrl: string };

const CURRENCIES = ["USD", "CAD", "GBP", "EUR", "AUD", "NZD", "CHF", "SEK", "NOK", "DKK", "PLN", "MXN", "BRL", "INR", "SGD", "ZAR", "AED", "JPY"] as const;
const REGION_CURRENCY: Record<string, string> = {
  US: "USD", CA: "CAD", GB: "GBP", AU: "AUD", NZ: "NZD", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", MX: "MXN", BR: "BRL", IN: "INR", SG: "SGD", ZA: "ZAR", AE: "AED", JP: "JPY",
  IE: "EUR", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", PT: "EUR", FI: "EUR", GR: "EUR", LU: "EUR",
};

function localCurrency(): string {
  try { return REGION_CURRENCY[new Intl.Locale(navigator.language).maximize().region ?? ""] ?? "USD"; } catch { return "USD"; }
}

const errText = (e: unknown, fallback: string) => (e instanceof GoogleApiError ? e.message : fallback);

export function ConnectStep({
  initialChoice, onSignIn, onCreate, onLink, note, canCreate = false, oauthVerified = false,
}: {
  initialChoice?: ConnectChoice | null;
  /** Komendly may create the account (status.canCreateAccounts). Otherwise we guide them to make one at Google. */
  canCreate?: boolean;
  /** Google verified "Sign in with Google" (status.oauthVerified). Until then the account number is the first choice. */
  oauthVerified?: boolean;
  onSignIn: () => Promise<void>;
  onCreate: (input: { email: string; currency: string; timeZone: string }) => Promise<void>;
  onLink: (customerId: string) => Promise<void>;
  note: SetupNote | null;
}) {
  const [choice, setChoice] = useState<ConnectChoice | null>(initialChoice ?? null);
  const [email, setEmail] = useState("");
  const [currency, setCurrency] = useState(localCurrency);
  const [rawId, setRawId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = normalizeCustomerId(rawId);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(errText(e, fallback)); } finally { setBusy(false); }
  };

  if (note) return <SetupWaiting note={note} />;

  const byNumber = { value: "id" as const, icon: KeyRound, title: oauthVerified ? "Give Komendly access with my account number instead" : "I have Google Ads: use my account number",
    hint: oauthVerified ? "No sign-in here. You accept our request inside Google Ads." : "Recommended. Type your account number, then accept our request inside Google Ads." };
  const signIn = { value: "have" as const, icon: LogIn, title: oauthVerified ? "I have Google Ads" : "I have Google Ads: sign in with Google instead",
    hint: "Sign in with the Google login you use for Google Ads." };
  const fresh = { value: "new" as const, icon: PlusCircle, title: "I don't have Google Ads yet",
    hint: canCreate ? "We create a Google Ads account for you. You add your card in Google." : "We show you how to make a free account in a few minutes." };
  const options: { value: ConnectChoice; icon: typeof LogIn; title: string; hint: string }[] = oauthVerified ? [signIn, fresh, byNumber] : [byNumber, signIn, fresh];

  return (
    <div className="space-y-4 text-sm">
      <p>Komendly creates your campaign in <span className="font-medium">your own</span> Google Ads account, paused. You start it when you&apos;re ready. Google charges your card for the ads, not Komendly.</p>
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 font-medium">Do you have a Google Ads account?</legend>
        {options.map((o) => (
          <label key={o.value} className={`flex cursor-pointer gap-3 rounded-md border px-3 py-2.5 ${choice === o.value ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}>
            <input type="radio" name="google-connect" className="mt-1 accent-primary" checked={choice === o.value} onChange={() => { setChoice(o.value); setError(null); }} />
            <o.icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block font-medium">{o.title}</span>
              <span className="block text-xs text-muted-foreground">{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {choice === "have" && (
        <div className="space-y-3 rounded-md bg-muted/50 px-3 py-3">
          <ul className="space-y-2 text-muted-foreground">
            {!oauthVerified && <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /> Google may show a warning that this app isn&apos;t verified yet. It&apos;s safe to continue: click Advanced, then Go to Komendly.</li>}
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /> Google asks you to allow Komendly to manage your ads. Press Allow.</li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /> We only create the campaign you check here. You can disconnect any time.</li>
          </ul>
          <Button onClick={() => run(onSignIn, "We couldn't start Google sign-in.")} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <LogIn />} Sign in with Google
          </Button>
          <p className="text-xs text-muted-foreground">You&apos;ll go to Google and come back here when you&apos;re done.</p>
        </div>
      )}

      {choice === "new" && !canCreate && (
        <div className="space-y-3 rounded-md bg-muted/50 px-3 py-3">
          <p className="font-medium">Make your free Google Ads account first. It takes a few minutes.</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Sign in with your Google account (your Gmail or work Google login).</li>
            <li>If Google asks you to make a campaign, choose <span className="font-medium">Switch to Expert Mode</span> or skip it. Komendly makes the campaign for you.</li>
            <li>Add your card under <span className="font-medium">Billing</span>. Google charges this card for your ads, not Komendly.</li>
          </ol>
          <Button asChild>
            <a href="https://ads.google.com/home/" target="_blank" rel="noreferrer"><PlusCircle /> Create your free Google Ads account <ExternalLink /></a>
          </Button>
          <p className="text-muted-foreground">Done? Come back here and pick one:</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { setChoice("id"); setError(null); }}><KeyRound /> Use my account number</Button>
            <Button size="sm" variant="outline" onClick={() => { setChoice("have"); setError(null); }}><LogIn /> Sign in with Google</Button>
          </div>
        </div>
      )}

      {choice === "new" && canCreate && (
        <form className="space-y-3 rounded-md bg-muted/50 px-3 py-3" onSubmit={(e) => {
          e.preventDefault();
          if (!emailOk) return;
          void run(() => onCreate({ email: email.trim(), currency, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }), "We couldn't create your Google Ads account.");
        }}>
          <div className="space-y-1.5">
            <Label htmlFor="google-new-email">Your Google email (Gmail or Google Workspace)</Label>
            <Input id="google-new-email" type="email" autoComplete="email" placeholder="you@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="text-xs text-muted-foreground">Google sends an invite to this email. You&apos;ll be the owner of the account.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="google-new-currency">Currency you pay in</Label>
            <select id="google-new-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-40">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">Google can&apos;t change this later, so pick the one on your card.</p>
          </div>
          <Button type="submit" disabled={busy || !emailOk}>{busy ? <Loader2 className="animate-spin" /> : <PlusCircle />} Create my Google Ads account</Button>
        </form>
      )}

      {choice === "id" && (
        <form className="space-y-3 rounded-md bg-muted/50 px-3 py-3" onSubmit={(e) => {
          e.preventDefault();
          if (id) void run(() => onLink(id), "We couldn't send the access request to that account.");
        }}>
          <div className="space-y-1.5">
            <Label htmlFor="google-customer-id">Your Google Ads account number</Label>
            <Input id="google-customer-id" inputMode="numeric" autoComplete="off" placeholder="123-456-7890" className="font-mono sm:w-48" value={rawId}
              onChange={(e) => setRawId(e.target.value)} aria-invalid={rawId.trim() !== "" && !id} aria-describedby="google-customer-id-help" />
            <div id="google-customer-id-help" className="space-y-1 text-xs text-muted-foreground">
              <p>Where to find it: open <a className="text-primary underline-offset-4 hover:underline" href="https://ads.google.com" target="_blank" rel="noreferrer">Google Ads</a> and look at the top right, next to your account name. It&apos;s 10 numbers, like 123-456-7890.</p>
              {rawId.trim() !== "" && !id && <p className="text-destructive">That should be 10 numbers, like 123-456-7890.</p>}
            </div>
          </div>
          <Button type="submit" disabled={busy || !id}>{busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Send access request</Button>
        </form>
      )}

      {error && <ErrorNote message={error} action={choice === "have" ? undefined : { label: "Help", href: HELP_PATH }} />}
      <p className="text-xs text-muted-foreground">Not sure? <Link href={HELP_PATH} className="text-primary underline-offset-4 hover:underline" target="_blank">Read the step-by-step guide</Link>.</p>
    </div>
  );
}

/** Shown right after we created or linked an account, until Google tells us it's done. */
export function SetupWaiting({ note }: { note: SetupNote }) {
  return (
    <div className="space-y-3 text-sm" aria-live="polite">
      {note.kind === "created" ? <CreatedSteps note={note} /> : <AcceptSteps note={note} />}
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> We check again every few seconds. You can keep this window open.</p>
    </div>
  );
}

export function CreatedSteps({ note }: { note: Extract<SetupNote, { kind: "created" }> }) {
  return (
    <div className="space-y-2">
      <p className="font-medium">Your Google Ads account is made ({formatCustomerId(note.customerId)}). Two things left:</p>
      <ol className="list-decimal space-y-1.5 pl-5">
        <li>Google sends an email to <span className="font-medium">{note.email}</span>. Open it and accept the invite.</li>
        <li>Add a payment card in Google Ads. Google charges this card for your ads, not Komendly.</li>
      </ol>
      <Button asChild size="sm" variant="outline">
        <a href={note.billingUrl || GOOGLE_BILLING_URL} target="_blank" rel="noreferrer">Add my card in Google Ads <ExternalLink /></a>
      </Button>
      <p className="text-xs text-muted-foreground">No email after 10 minutes? Check your spam folder.</p>
    </div>
  );
}

export function AcceptSteps({ note }: { note: Extract<SetupNote, { kind: "linked" }> }) {
  return (
    <div className="space-y-2">
      <p className="font-medium">We sent an access request to {formatCustomerId(note.customerId)}. Accept it in Google Ads:</p>
      <ol className="list-decimal space-y-1.5 pl-5">
        <li>Open Google Ads and sign in.</li>
        <li>Click <span className="font-medium">Admin</span> (the gear icon on the left).</li>
        <li>Click <span className="font-medium">Access and security</span>, then the <span className="font-medium">Managers</span> tab.</li>
        <li>Find the request from Komendly and click <span className="font-medium">Accept</span>.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button asChild size="sm" variant="outline">
          <a href={note.acceptUrl || GOOGLE_MANAGERS_URL} target="_blank" rel="noreferrer">Open Managers in Google Ads <ExternalLink /></a>
        </Button>
        <a className="break-all text-xs text-primary underline-offset-4 hover:underline" href={GOOGLE_MANAGERS_URL} target="_blank" rel="noreferrer">ads.google.com/aw/accountaccess/managers</a>
      </div>
    </div>
  );
}
