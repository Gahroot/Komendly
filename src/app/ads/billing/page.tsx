import { Check, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdsNav } from "@/components/ads/ads-nav";
import { freeAdsBlock } from "@/lib/ads/lifecycle/free-ads";
import { ensureReferralCode } from "@/lib/ads/referrals";
import { FreeAdsCard } from "./_components/free-ads-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth";
import { AD_DEPARTMENT_STACK, AUTOPILOT_STACK, AUTOPILOT_FULL_MESSAGE, AUTOPILOT_FOUNDING_LINE, AUTOPILOT_REGULAR_PRICE_CENTS, ADS_GUARANTEE, ADS_PLANS, ADS_TOPUPS, PLAN_USAGE_NOTE, FOUNDING_PRICE_LOCK, FOUNDING_TERMS, LAUNCH_QUARTER, offerCouponId, offerFirstPaymentCents, stackTotalUsd, ANNUAL_MONTHS, ANNUAL_MONTHS_PAID, annualCredits, annualPriceCents, annualPriceIdFor, getPlan, priceIdFor, UNLOCK_PACK, unlockPackCouponId, planUsageLine } from "@/lib/ads/billing-config";
import { UsageBar } from "@/components/ads/usage-bar";
import { canBuyUnlimitedWeek, UNLIMITED_WEEK, UNLIMITED_WEEK_LINE, unlimitedPassActive, usageMeter } from "@/lib/ads/billing-config";
import { isBonusUnlocked } from "@/lib/ads/bonus-unlock";
import { UnlockPackNext } from "@/components/ads/unlock-pack-offer";
import Link from "next/link";
import { formatCents, formatDate } from "@/lib/ads/billing-format";
import { isPaidWorkspace } from "@/lib/ads/billing-gates";
import { isBillingConfigured } from "@/lib/ads/billing-stripe";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";
import { prisma } from "@/lib/prisma";
import { foundingSpotsLeft } from "@/lib/ads/founding-spots";
import { checkoutTerms } from "@/lib/ads/public-offer";
import { expiringCredits } from "@/lib/ads/referrals";
import { AutoCheckout, BillingActionButton } from "./_components/billing-action-button";
import { autoCheckoutPlan, signedOutBillingRedirect } from "@/lib/ads/plan-checkout";
import { CheckoutDownsell } from "@/components/ads/checkout-downsell";
import { PricingBeacon } from "@/components/analytics/pricing-beacon";
import { CheckoutReturnTracker } from "@/components/analytics/checkout-return-tracker";
import { loadCheckoutPixel } from "@/lib/ads/checkout-pixel";
import { isStudioLaunchOfferOpen, STUDIO_LAUNCH_OFFER } from "@/lib/hub/money-model";
import { trackAdsEvent } from "@/lib/ads/events";
import { getSelfRefundEligibility } from "@/lib/ads/self-refund";
import { LaunchGuideCard } from "@/components/ads/launch-guide-card";
import { SelfRefundButton } from "./_components/self-refund-button";
import { BrandingCard } from "./_components/branding-card";
import { isPaidForBranding } from "@/lib/growth/viral-branding";

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
  expire: "Unused credits expired",
  referral_reward: "Referral reward (friend finished their free ads)",
  studio_charge: "Ozzy Studio video",
  offer_bonus: "Launch offer bonus",
};

export default async function AdsBillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string; declined?: string; session_id?: string; billing?: string; offer?: string; bought?: string; plan?: string }> }) {
  const user = await getCurrentUser();
  const { checkout, declined, session_id, billing, offer, bought, plan: pickedPlan } = await searchParams;
  if (!user) redirect(signedOutBillingRedirect(pickedPlan, billing === "year"));
  const now = new Date();
  const yearly = billing === "year";
  const ws = await getOrCreateWorkspace(user);
  const ledger = await prisma.creditLedger.findMany({ where: { workspaceId: ws.id }, orderBy: { createdAt: "desc" }, take: 50 });
  const expiring = await expiringCredits(ws.id, ws.creditBalance);
  const configured = isBillingConfigured();
  const paid = isPaidWorkspace(ws);
  const plan = getPlan(ws.adsPlan);
  const launchOpen = !paid && !ws.suspendedAt && isStudioLaunchOfferOpen(ws.studioOfferReadyAt, now);
  if (launchOpen && offer === STUDIO_LAUNCH_OFFER.key && !checkout) await trackAdsEvent("studio_offer_viewed", { workspaceId: ws.id, userId: user.id, props: { offer: STUDIO_LAUNCH_OFFER.key } });
  const launchEndsAt = ws.studioOfferReadyAt ? new Date(ws.studioOfferReadyAt.getTime() + STUDIO_LAUNCH_OFFER.windowHours * 3_600_000) : null;
  const leftMin = launchEndsAt ? Math.max(0, Math.floor((launchEndsAt.getTime() - now.getTime()) / 60_000)) : 0;
  const growth = getPlan(STUDIO_LAUNCH_OFFER.plan);
  // New buyers see only plans for sale (Growth/Scale hidden during the founding offer); a subscriber on a hidden
  // plan still sees their own plan card.
  // Monthly-only plans (Growth Autopilot) are left out of the yearly view.
  const shownPlans = ADS_PLANS.filter((p) => (!p.hiddenForNewBuyers || (paid && ws.adsPlan === p.key)) && !(yearly && !p.annualPriceEnv));
  const autopilotFull = (await foundingSpotsLeft(prisma)) <= 0;
  const onDepartment = paid && Boolean(plan?.weeklyDrop);
  const passOn = unlimitedPassActive(ws, now);
  const passBuyable = canBuyUnlimitedWeek(ws) && Boolean(priceIdFor(UNLIMITED_WEEK));
  const refund = paid ? await getSelfRefundEligibility(ws, user, now) : null;
  // $9 "Unlock this pack" replaces the 10-credit pack in the cancel downsell while the user has locked bonus ads.
  const downsellUnlock = checkout === "canceled" && Boolean(declined) && !paid && !ws.suspendedAt && Boolean(priceIdFor(UNLOCK_PACK))
    && !(await isBonusUnlocked(ws))
    && Boolean(await prisma.ad.findFirst({ where: { workspaceId: ws.id, status: "ready", visualBrief: { path: ["locked"], equals: true } }, select: { id: true } }));
  const unlockNext = checkout === "success" && bought === UNLOCK_PACK.key && !paid && !ws.suspendedAt;
  const autoKey = autoCheckoutPlan({ plan: pickedPlan, paid, checkout, suspended: Boolean(ws.suspendedAt), configured });
  const autoPlan = autoKey ? getPlan(autoKey) : null;
  const autoReady = autoPlan && (yearly ? annualPriceIdFor(autoPlan) : priceIdFor(autoPlan)) ? autoPlan : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn />
      <PricingBeacon page="/ads/billing" />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Plan & billing</h1>
          <p className="text-muted-foreground">One Ozzy wallet for Ad Packs and Ozzy Studio · 1 credit = 1 static ad · an animated ad 5 · a Studio video 5 to 8.</p>
        </div>

        {autoReady && <AutoCheckout planKey={autoReady.key} planName={autoReady.name} interval={yearly ? "year" : "month"} />}
        {(checkout === "success" || checkout === "canceled") && <CheckoutReturnTracker outcome={checkout} pixel={checkout === "success" ? await loadCheckoutPixel(session_id, ws.id) : null} />}
        {checkout === "success" && <Notice tone="ok">Payment received. Your credits appear here within a few seconds.</Notice>}
        {unlockNext && <UnlockPackNext couponReady={Boolean(unlockPackCouponId()) && !ws.stripeSubscriptionId} />}
        {checkout === "success" && !unlockNext && <FreeAdsCard block={freeAdsBlock({ referralCode: await ensureReferralCode(ws, user).catch(() => null), paid: true })} />}
        {checkout === "canceled" && <Notice tone="muted">Checkout canceled. Nothing was charged.</Notice>}
        {checkout === "canceled" && declined && !paid && !ws.suspendedAt && configured && <CheckoutDownsell declined={declined.slice(0, 40)} unlockPack={downsellUnlock} />}
        {!configured && <Notice tone="warn">Billing isn&apos;t configured yet, so plans can&apos;t be bought right now. Your free trial still works.</Notice>}
        {ws.suspendedAt && <Notice tone="warn">This workspace is suspended. Contact support.</Notice>}
        <BrandingCard paid={isPaidForBranding(ws, now)} removeBranding={(await prisma.adsBrandingSetting.findUnique({ where: { workspaceId: ws.id }, select: { removeBranding: true } }))?.removeBranding ?? true} />

        {offer === STUDIO_LAUNCH_OFFER.key && !launchOpen && <Notice tone="muted">{paid ? "You're already on a plan, so the Studio launch offer doesn't apply." : "The Studio launch offer has ended. The plans below are still here, with the same 30-day guarantee."}</Notice>}
        {launchOpen && growth && ws.studioOfferReadyAt && (
          <Card className="glow-primary border-2 border-primary">
            <CardHeader>
              <CardDescription>{STUDIO_LAUNCH_OFFER.name} · <span className="font-medium text-foreground tabular-nums">{Math.floor(leftMin / 60)}h {leftMin % 60}m left</span> · ends {launchEndsAt ? formatDate(launchEndsAt) : ""}</CardDescription>
              <CardTitle className="font-display text-2xl">{STUDIO_LAUNCH_OFFER.headline}: {growth.name}, first month {formatCents(offerFirstPaymentCents(LAUNCH_QUARTER))} (then {formatCents(growth.priceCents)}/month)</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">{STUDIO_LAUNCH_OFFER.stack.map((h) => <li key={h} className="flex items-center gap-2"><Check className="size-4 shrink-0 text-primary" />{h}</li>)}</ul>
            </CardContent>
            <CardFooter>
              <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "plan", key: growth.key, offer: STUDIO_LAUNCH_OFFER.key, placement: "studio_launch" }} label={`Start for ${formatCents(offerFirstPaymentCents(LAUNCH_QUARTER))}`} disabled={!configured || !priceIdFor(growth) || !offerCouponId(LAUNCH_QUARTER)} />
            </CardFooter>
          </Card>
        )}

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
              {paid && ws.currentPeriodEnd ? `Renews ${formatDate(ws.currentPeriodEnd).slice(0, 10)}` : "Pick a plan for all ratios, all awareness levels and animated video ads."}
            </CardContent>
            {refund?.ok && (
              <CardFooter className="block">
                <SelfRefundButton amountLabel={formatCents(refund.amountCents)} endsLabel={formatDate(refund.endsAt).slice(0, 10)} />
              </CardFooter>
            )}
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{passOn ? "Unlimited week" : usageMeter(ws.adsPlan, ws.creditBalance) ? "Usage this month" : "Credit balance"}</CardDescription>
              {passOn && ws.unlimitedUntil ? <CardTitle className="text-2xl">Unlimited until {formatDate(ws.unlimitedUntil).slice(0, 10)}</CardTitle> : usageMeter(ws.adsPlan, ws.creditBalance) ? <UsageBar plan={ws.adsPlan} balance={ws.creditBalance} className="pt-2" /> : <CardTitle className="text-4xl tabular-nums">{ws.creditBalance}</CardTitle>}
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              {expiring.map((e) => <p key={e.expiresAt} className="font-medium text-[var(--studio-gold,currentColor)]">{e.credits} referral credits expire {formatDate(new Date(e.expiresAt)).slice(0, 10)}</p>)}
              <p>Plan usage resets each billing period. Top-up credits never expire. Referral credits expire 30 days after you earn them.</p>
            </CardContent>
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

        {onDepartment && plan && (
          <Card className="border-2 border-primary">
            <CardHeader>
              <CardDescription>{plan.key === "agency" ? `Your Ozzy Agency plan · ${planUsageLine(plan)}` : plan.key === "autopilot" ? "Your Growth Autopilot · Ozzy's AI Marketing Team" : `Your Ozzy Ad Department${plan.usageMultiple ? ` · ${plan.usageMultiple}x Starter usage` : ""}`}</CardDescription>
              <CardTitle className="font-display text-2xl">{plan.key === "autopilot" ? "Your team runs your Facebook and Instagram lead ads" : "Fresh ads every Monday, a coach that tells you what's working"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ul className="space-y-2">{(plan.key === "autopilot" ? AUTOPILOT_STACK : AD_DEPARTMENT_STACK).map((i) => <li key={i.label} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" /><span><span className="font-medium">{i.bonus ? "Bonus: " : ""}{i.label}</span> · {i.detail}</span></li>)}</ul>
              {plan.usageMultiple && plan.key !== "autopilot" && <p className="text-muted-foreground">{PLAN_USAGE_NOTE} {FOUNDING_TERMS} {FOUNDING_PRICE_LOCK}</p>}
            </CardContent>
          </Card>
        )}
        {onDepartment && <LaunchGuideCard defaultOpen={false} />}

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{yearly ? "Yearly plans" : "Monthly plans"}</h2>
            <IntervalToggle yearly={yearly} />
          </div>
          {yearly && <p className="text-sm text-muted-foreground">Pay for {ANNUAL_MONTHS_PAID} months, get {ANNUAL_MONTHS}. All {ANNUAL_MONTHS} months of credits land in your account the day you pay and stay valid for the year.</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {shownPlans.map((p) => {
              const current = paid && ws.adsPlan === p.key;
              return (
                <Card key={p.key} className={current || (!paid && p.recommended) ? "glow-primary border-2 border-primary md:-my-2" : undefined}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">{p.name}{current ? <Badge>current</Badge> : !paid && p.recommended && <Badge>{p.key === "autopilot" ? "Founding · done for you" : p.usageMultiple ? `Founding · ${p.usageMultiple}x` : "Recommended"}</Badge>}</CardTitle>
                    <CardDescription>
                      {yearly ? (
                        <><span className="text-3xl font-semibold text-foreground">{formatCents(annualPriceCents(p))}</span> / year
                          <span className="mt-1 block text-xs">{p.usageMultiple ? planUsageLine(p) : `${annualCredits(p)} credits up front · ${perCredit(annualPriceCents(p), annualCredits(p))}`} · save {formatCents(p.priceCents * (ANNUAL_MONTHS - ANNUAL_MONTHS_PAID))}</span></>
                      ) : (
                        <><span className="text-3xl font-semibold text-foreground">{formatCents(p.priceCents)}</span> / month
                          <span className="mt-1 block text-xs">{p.key === "autopilot" ? `Founding price · regular ${formatCents(AUTOPILOT_REGULAR_PRICE_CENTS)}/month · ${AUTOPILOT_FOUNDING_LINE}` : p.usageMultiple ? (p.key === "agency" ? planUsageLine(p) : `${p.usageMultiple}x Starter usage · do it yourself · stacked value $${stackTotalUsd().toLocaleString("en-US")}/month`) : perCredit(p.priceCents, p.monthlyCredits)}</span></>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">{p.highlights.map((h) => <li key={h} className="flex items-center gap-2"><Check className="size-4 shrink-0 text-primary" />{h}</li>)}</ul>
                  </CardContent>
                  <CardFooter className="flex-col items-stretch gap-2">
                    {p.key === "autopilot" && autopilotFull && !current ? (
                      <p role="status" className="text-sm font-medium">{AUTOPILOT_FULL_MESSAGE}</p>
                    ) : paid ? (
                      <BillingActionButton endpoint="/api/ads-billing/portal" label={current ? "Manage" : "Switch plan"} variant="outline" disabled={!configured} />
                    ) : (
                      <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "plan", key: p.key, interval: yearly ? "year" : "month" }} label={yearly ? `Choose ${p.name} yearly` : `Choose ${p.name}`} disabled={!configured || !(yearly ? annualPriceIdFor(p) : priceIdFor(p)) || Boolean(ws.suspendedAt)} />
                    )}
                    {!paid && <p className="text-center text-xs text-muted-foreground">{checkoutTerms(p, { yearly })}</p>}
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

        {(passBuyable || passOn) && (
          <Card className="border-2 border-primary">
            <CardHeader>
              <CardDescription>Need more than your plan?</CardDescription>
              <CardTitle>{UNLIMITED_WEEK.name} · {formatCents(UNLIMITED_WEEK.priceCents)} one-time</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {UNLIMITED_WEEK_LINE}{passOn && ws.unlimitedUntil ? ` Yours runs until ${formatDate(ws.unlimitedUntil).slice(0, 10)}; another week adds 7 more days.` : ""}
            </CardContent>
            <CardFooter>
              <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "topup", key: UNLIMITED_WEEK.key }} label={passOn ? "Add another week" : "Go unlimited for a week"} disabled={!configured || !passBuyable} />
            </CardFooter>
          </Card>
        )}

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

function IntervalToggle({ yearly }: { yearly: boolean }) {
  const base = "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors";
  return (
    <div className="inline-flex rounded-xl border border-border bg-card p-1" role="group" aria-label="Billing interval">
      <Link href="/ads/billing" scroll={false} aria-pressed={!yearly} className={`${base} ${!yearly ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>Monthly</Link>
      <Link href="/ads/billing?billing=year" scroll={false} aria-pressed={yearly} className={`${base} ${yearly ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>Yearly · 2 months free</Link>
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
