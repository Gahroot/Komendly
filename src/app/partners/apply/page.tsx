import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { fraunces } from "@/components/studio/fonts";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PartnerApplyForm } from "./_components/partner-apply-form";
import "@/components/studio/studio.css";

export const metadata: Metadata = { title: "Apply to the partner program", robots: { index: false, follow: true }, alternates: { canonical: "/partners/apply" } };
export const dynamic = "force-dynamic";

const NEXT = encodeURIComponent("/partners/apply");

export default async function PartnerApplyPage() {
  const user = await getCurrentUser();
  const partner = user ? await prisma.adsPartner.findUnique({ where: { userId: user.id }, select: { status: true, adminNote: true } }) : null;
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <StudioNav signedIn={!!user} />
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        <div className="text-center">
          <Image src="/brand/ozzy-explorer-focused.png" alt="" width={88} height={88} unoptimized className="mx-auto [image-rendering:pixelated]" />
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Partner program</p>
          <h1 className="font-display mt-2 text-balance text-3xl font-medium tracking-[-0.02em] sm:text-5xl">Apply in 2 minutes</h1>
          <p className="mt-3 text-muted-foreground">30% of what your clients pay for 12 months, plus 3 free demo packs a month.</p>
        </div>
        <div className="glass mt-8 rounded-2xl p-5 sm:p-7">
          {!user ? (
            <div className="space-y-4 text-center">
              <h2 className="font-display text-2xl font-medium">First, your Komendly account</h2>
              <p className="text-sm text-muted-foreground">Partners use a normal Komendly account: it holds your link, your payouts and your own free ad pack. It takes 20 seconds.</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button asChild size="lg"><Link href={`/ads/signup?next=${NEXT}`}>Create my free account</Link></Button>
                <Button asChild size="lg" variant="outline"><Link href={`/ads/login?next=${NEXT}`}>I have an account</Link></Button>
              </div>
            </div>
          ) : partner?.status === "approved" ? (
            <div className="space-y-4 text-center">
              <h2 className="font-display text-2xl font-medium">You&apos;re already a partner</h2>
              <Button asChild size="lg"><Link href="/ads/partner">Open my partner dashboard</Link></Button>
            </div>
          ) : partner?.status === "applied" || partner?.status === "paused" ? (
            <div className="space-y-3 text-center" role="status">
              <h2 className="font-display text-2xl font-medium">{partner.status === "applied" ? "Your application is in" : "Your partner account is paused"}</h2>
              <p className="text-sm text-muted-foreground">{partner.status === "applied" ? "We review every application by hand, usually within 2 business days. We'll email you." : "Reply to any of our emails and we'll sort it out."}</p>
            </div>
          ) : (
            <>
              <p className="mb-5 text-sm text-muted-foreground">Applying as <span className="text-foreground">{user.name ? `${user.name} · ` : ""}{user.email}</span>. <Link className="underline underline-offset-4" href={`/ads/login?next=${NEXT}`}>Not you?</Link></p>
              {partner?.status === "rejected" && <p className="mb-5 rounded-lg border border-border p-3 text-sm text-muted-foreground">Your last application wasn&apos;t approved{partner.adminNote ? `: ${partner.adminNote}` : "."} You&apos;re welcome to apply again.</p>}
              <PartnerApplyForm defaultEmail={user.email} />
            </>
          )}
        </div>
      </main>
    </StudioRoot>
  );
}
