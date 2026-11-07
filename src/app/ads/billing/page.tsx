import { Check, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdsNav } from "@/components/ads/ads-nav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth";
import { ADS_GUARANTEE, ADS_PLANS, ADS_TOPUPS, getPlan, priceIdFor } from "@/lib/ads/billing-config";
import { formatCents, formatDate } from "@/lib/ads/billing-format";
import { isPaidWorkspace } from "@/lib/ads/billing-gates";
import { isBillingConfigured } from "@/lib/ads/billing-stripe";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";
import { prisma } from "@/lib/prisma";
import { BillingActionButton } from "./_components/billing-action-button";
import { CheckoutReturnTracker } from "@/components/analytics/checkout-return-tracker";

export const metadata: Metadata = { title: "Plan & billing", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, string> = {
  trial_grant: "Free trial",
  subscription_grant: "Monthly plan credits",
  topup: "Top-up",
  reserve: "Ads generated",
  release: "Refunded (failed ad)",
  refund: "Refund",
  admin_adjust: "Adjustment",
  expire: "Unused plan credits expired",
};

export default async function AdsBillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/ads/login?next=/ads/billing");
  const { checkout } = await searchParams;
  const ws = await getOrCreateWorkspace(user);
  const ledger = await prisma.creditLedger.findMany({ where: { workspaceId: ws.id }, orderBy: { createdAt: "desc" }, take: 50 });
  const configured = isBillingConfigured();
  const paid = isPaidWorkspace(ws);
  const plan = getPlan(ws.adsPlan);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Plan & billing</h1>
          <p className="text-muted-foreground">1 credit = 1 static ad in one ratio · an animated ad costs 5 credits.</p>
        </div>

        {(checkout === "success" || checkout === "canceled") && <CheckoutReturnTracker outcome={checkout} />}
        {checkout === "success" && <Notice tone="ok">Payment received. Your credits appear here within a few seconds.</Notice>}
        {checkout === "canceled" && <Notice tone="muted">Checkout canceled. Nothing was charged.</Notice>}
        {!configured && <Notice tone="warn">Billing isn&apos;t configured yet, so plans can&apos;t be bought right now. Your free trial still works.</Notice>}
        {ws.suspendedAt && <Notice tone="warn">This workspace is suspended. Contact support.</Notice>}

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Current plan</CardDescription>
              <CardTitle className="flex items-center gap-2 text-2xl">
                {plan?.name ?? "Free trial"}
                <Badge variant={paid ? "default" : "secondary"}>{paid ? ws.subscriptionStatus : ws.trialUsedAt ? "trial used" : "trial"}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {paid && ws.currentPeriodEnd ? `Renews ${formatDate(ws.currentPeriodEnd).slice(0, 10)}` : "Pick a plan for all ratios, all awareness levels and Meta publishing."}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Credit balance</CardDescription>
              <CardTitle className="text-4xl tabular-nums">{ws.creditBalance}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Plan credits reset each billing period. Top-up credits never expire.</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Subscription</CardDescription>
              <CardTitle className="text-lg">Invoices, card & cancellation</CardTitle>
            </CardHeader>
            <CardFooter>
              <BillingActionButton endpoint="/api/ads-billing/portal" label="Manage subscription" variant="outline" disabled={!configured || !ws.stripeCustomerId} />
            </CardFooter>
          </Card>
        </div>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Monthly plans</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {ADS_PLANS.map((p) => {
              const current = paid && ws.adsPlan === p.key;
              return (
                <Card key={p.key} className={current || (!paid && p.key === "growth") ? "glow-primary border-2 border-primary md:-my-2" : undefined}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">{p.name}{current ? <Badge>current</Badge> : !paid && p.key === "growth" && <Badge>Most popular</Badge>}</CardTitle>
                    <CardDescription><span className="text-3xl font-semibold text-foreground">{formatCents(p.priceCents)}</span> / month
                      <span className="mt-1 block text-xs">{perCredit(p.priceCents, p.monthlyCredits)}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">{p.highlights.map((h) => <li key={h} className="flex items-center gap-2"><Check className="size-4 shrink-0 text-primary" />{h}</li>)}</ul>
                  </CardContent>
                  <CardFooter>
                    {paid ? (
                      <BillingActionButton endpoint="/api/ads-billing/portal" label={current ? "Manage" : "Switch plan"} variant="outline" disabled={!configured} />
                    ) : (
                      <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "plan", key: p.key }} label={`Choose ${p.name}`} disabled={!configured || !priceIdFor(p) || Boolean(ws.suspendedAt)} />
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
            {ADS_GUARANTEE}
          </p>
        </section>

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">No subscription? Buy credits once</h2>
            <p className="text-sm text-muted-foreground">Pay once, no monthly plan needed. Credit packs never expire.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {ADS_TOPUPS.map((t) => (
              <Card key={t.key}>
                <CardHeader>
                  <CardTitle>{t.name}</CardTitle>
                  <CardDescription>{formatCents(t.priceCents)} one-time · never expire · {perCredit(t.priceCents, t.credits)}</CardDescription>
                </CardHeader>
                <CardFooter>
                  <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "topup", key: t.key }} label={`Buy ${t.name}`} variant="outline" disabled={!configured || !priceIdFor(t) || Boolean(ws.suspendedAt)} />
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Credit history</h2>
          <Card>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>What</TableHead><TableHead className="text-right">Credits</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
                <TableBody>
                  {ledger.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-muted-foreground">{formatDate(l.createdAt)}</TableCell>
                      <TableCell>{REASON_LABELS[l.reason] ?? l.reason}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.delta > 0 ? `+${l.delta}` : l.delta}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.balanceAfter}</TableCell>
                    </TableRow>
                  ))}
                  {ledger.length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No credit activity yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

function perCredit(priceCents: number, credits: number): string {
  return `$${(priceCents / credits / 100).toFixed(2)} per credit`;
}

function Notice({ tone, children }: { tone: "ok" | "warn" | "muted"; children: React.ReactNode }) {
  const cls = tone === "warn" ? "border-[var(--warning)]/40 bg-[var(--warning)]/10 text-foreground" : tone === "ok" ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground";
  return <div role="status" className={`rounded-xl border p-4 text-sm ${cls}`}>{children}</div>;
}
