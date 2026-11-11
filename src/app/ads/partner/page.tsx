import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, Download, Gift, MousePointerClick, Sparkles, UserPlus, Wallet } from "lucide-react";
import { AdsNav } from "@/components/ads/ads-nav";
import { CopyTextButton } from "@/components/growth/copy-text-button";
import { ShareButtons } from "@/components/growth/share-buttons";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { formatCents } from "@/lib/ads/billing-format";
import { PARTNER_TERMS } from "@/lib/ads/partner";
import { loadPartnerDashboard } from "@/lib/ads/partner-admin";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Partner dashboard", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—");

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "border-border text-muted-foreground" },
  payable: { label: "Payable", cls: "border-sky-400/40 bg-sky-400/10 text-sky-200" },
  paid: { label: "Paid", cls: "border-[var(--studio-gold)]/50 bg-[var(--studio-gold)]/15 text-[var(--studio-gold)]" },
  void: { label: "Refunded", cls: "border-destructive/40 text-destructive" },
};

const KIT_SAMPLES = [
  { src: "/ads/samples/tidybooks-ad-0-4x5.jpg", name: "tidybooks-ad-4x5.jpg" },
  { src: "/ads/samples/plausible-ad-1-4x5.jpg", name: "plausible-ad-4x5.jpg" },
  { src: "/ads/samples/maxteriors-ad-0.jpg", name: "maxteriors-ad-1x1.jpg" },
  { src: "/ads/samples/nightshift-ad-1-4x5.jpg", name: "nightshift-ad-4x5.jpg" },
];

function blurbs(link: string) {
  return [
    { t: "Short (social / DM)", b: `Need ads for your business? Komendly turns your website into 10 ready-to-run Facebook & Instagram ads in minutes, free to try: ${link}` },
    { t: "Client email", b: `Hi! Quick idea for your ads: Komendly reads your website and makes on-brand Facebook & Instagram ads from it, in a few minutes. You can try it free (no card) here: ${link}\n\nHappy to help you pick the best ones.` },
    { t: "Newsletter", b: `Tool I recommend: Komendly. Paste your website, get a pack of ready-to-run ads written from your customers' own words, plus an animated one. Free to try: ${link}` },
  ];
}

export default async function PartnerDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/ads/login?next=/ads/partner");
  const partner = await prisma.adsPartner.findUnique({ where: { userId: user.id } });
  if (!partner || partner.status !== "approved") redirect("/partners/apply");
  const d = await loadPartnerDashboard(partner);
  const link = d.link ?? "";
  const s = d.summary;
  const stats = [
    { icon: MousePointerClick, k: d.stats.clicks, v: "Link clicks" },
    { icon: UserPlus, k: d.stats.signups, v: "Sign-ups" },
    { icon: Sparkles, k: d.stats.trials, v: "Free ads done" },
    { icon: Wallet, k: d.stats.paying, v: "Paying clients" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        <section className="studio-frame relative overflow-hidden rounded-3xl p-5 sm:p-8">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-[var(--studio-gold)]/10 blur-3xl" />
          <div className="relative grid gap-6 md:grid-cols-[1fr_1.1fr] md:items-center">
            <div className="flex items-start gap-4">
              <Image src="/brand/ozzy-adventurer-cool.png" alt="" width={88} height={88} unoptimized className="size-16 shrink-0 [image-rendering:pixelated] sm:size-20" />
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Partner dashboard</p>
                <h1 className="font-display mt-2 text-balance text-[1.9rem] font-medium leading-[1.08] tracking-[-0.02em] sm:text-4xl">Your link earns {partner.commissionPct}% for {partner.commissionMonths} months</h1>
                <p className="mt-2 text-sm text-muted-foreground">Clients who sign up through it within {PARTNER_TERMS.attributionDays} days count as yours.</p>
              </div>
            </div>
            {link ? <ShareButtons link={link} subject="Ads made from your website" text={blurbs(link)[0]?.b ?? link} /> : <p className="text-sm text-muted-foreground">Your link is being set up. Refresh in a minute.</p>}
          </div>
        </section>

        <section aria-label="Your referrals" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((x) => (
            <div key={x.v} className="glass rounded-2xl p-4">
              <x.icon className="size-4 text-[var(--studio-gold)]" aria-hidden />
              <p className="mt-2 text-2xl font-semibold tabular-nums">{x.k}</p>
              <p className="text-xs text-muted-foreground">{x.v}</p>
            </div>
          ))}
        </section>

        <section className="glass rounded-3xl p-5 sm:p-6" aria-labelledby="earn-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 id="earn-title" className="text-lg font-semibold">Earnings</h2>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarClock className="size-4" aria-hidden />Next payout {day(s.nextPayoutAt)}: <span className="font-medium text-foreground">{s.nextPayoutCents ? formatCents(s.nextPayoutCents) : `under ${formatCents(PARTNER_TERMS.minPayoutCents)} minimum, rolls over`}</span></p>
            </div>
            <dl className="grid grid-cols-3 gap-4 text-right">
              <div><dt className="text-xs text-muted-foreground">Pending</dt><dd className="text-lg font-semibold tabular-nums">{formatCents(s.pendingCents)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Payable</dt><dd className="text-lg font-semibold tabular-nums text-sky-200">{formatCents(s.payableCents)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Paid</dt><dd className="text-lg font-semibold tabular-nums text-[var(--studio-gold)]">{formatCents(s.paidCents)}</dd></div>
            </dl>
          </div>
          {d.commissions.length ? (
            <ul className="mt-5 divide-y divide-border rounded-xl border border-border text-sm">
              {d.commissions.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.client}</p>
                    <p className="text-xs text-muted-foreground">{day(c.createdAt)} · paid {formatCents(c.amountCents)}{c.status === "pending" ? ` · payable ${day(c.availableAt)}` : c.status === "paid" ? ` · paid out ${day(c.paidAt)}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn("rounded-full border px-2 py-0.5 text-xs", STATUS[c.status]?.cls)}>{STATUS[c.status]?.label ?? c.status}</span>
                    <span className="w-16 text-right font-semibold tabular-nums">{formatCents(c.commissionCents)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No commissions yet. They appear here the moment a client you referred pays. Each one is payable after the {PARTNER_TERMS.refundWindowDays}-day refund window.</p>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
          <div className="glass flex flex-col rounded-3xl p-5 sm:p-6">
            <Gift className="size-5 text-[var(--studio-gold)]" aria-hidden />
            <h2 className="mt-3 text-lg font-semibold">Demo packs</h2>
            <p className="mt-1 text-sm text-muted-foreground">Make 3 ads from a client&apos;s own website and send them the link. The fastest way to a yes.</p>
            <p className="mt-4 text-3xl font-semibold tabular-nums">{d.giftsLeft}<span className="text-base font-normal text-muted-foreground"> of {partner.demoGiftsPerMonth} left this month</span></p>
            <Button asChild className="mt-4 w-full" disabled={!d.giftsLeft}><Link href="/ads/gifts">{d.giftsLeft ? "Make a demo pack" : "See my demo packs"}</Link></Button>
          </div>
          <div className="glass rounded-3xl p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Marketing kit</h2>
            <ul className="mt-3 space-y-3">
              {blurbs(link).map((b) => (
                <li key={b.t} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{b.t}</p><CopyTextButton text={b.b} /></div>
                  <p className="mt-1.5 whitespace-pre-line text-sm">{b.b}</p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Sample ads to show clients</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {KIT_SAMPLES.map((k) => (
                <a key={k.src} href={k.src} download={k.name} className="group relative overflow-hidden rounded-lg border border-border" aria-label={`Download ${k.name}`}>
                  <Image src={k.src} alt="" width={240} height={300} className="aspect-[4/5] h-auto w-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100"><Download className="size-4" aria-hidden /></span>
                </a>
              ))}
            </div>
          </div>
        </section>
        <p className="text-center text-xs text-muted-foreground">Payouts: monthly via {partner.payoutMethod ?? "PayPal/Wise"} to {partner.payoutEmail ?? user.email}, minimum {formatCents(PARTNER_TERMS.minPayoutCents)}. Questions? Reply to any Komendly email.</p>
      </main>
    </div>
  );
}
