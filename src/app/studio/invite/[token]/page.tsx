import Link from "next/link";
import { OzzyLazy } from "@/components/ozzy";
import { prisma } from "@/lib/prisma";
import { STUDIO_INVITE } from "@/lib/studio/contracts";
import { isPlausibleInviteToken } from "@/lib/studio/invite";

export const dynamic = "force-dynamic";
export const metadata = { title: "2 free videos from Ozzy", robots: { index: false, follow: false } };

export default async function StudioInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = isPlausibleInviteToken(token) ? await prisma.studioInvite.findUnique({ where: { token }, select: { status: true, senderUserId: true } }) : null;
  const sender = invite ? await prisma.user.findUnique({ where: { id: invite.senderUserId }, select: { name: true } }) : null;
  const from = sender?.name?.split(" ")[0] || "A friend";
  const valid = invite?.status === "sent";
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-5 py-16 text-center">
      <OzzyLazy size={150} perch="ground" />
      <p className="studio-rise mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--studio-gold)]">Ozzy Studio</p>
      <h1 className="studio-rise mt-3 text-balance font-display text-4xl text-[oklch(0.97_0.03_80)] sm:text-5xl">
        {valid ? <>{from} gave you <em>{STUDIO_INVITE.friendFreeVideos} free videos</em></> : "This invite has been used"}
      </h1>
      <p className="studio-rise mt-4 text-[15px] text-[oklch(0.86_0.03_80)]">
        {valid
          ? "G'day! I'm Ozzy. Tell me what you want, a promo, a launch video or your own footage cut into an ad, and I'll make it while we chat. No card needed."
          : "No worries: every new account still gets a free video made by chatting with Ozzy."}
      </p>
      <Link href={valid ? `/api/studio/invite/${token}` : "/ads/signup?next=/studio"} className="spellbar__cta mt-8 inline-flex h-12 items-center rounded-xl px-7 text-base font-semibold">
        {valid ? "Claim my free videos" : "Make a free video"}
      </Link>
      <p className="mt-4 text-sm text-[oklch(0.75_0.03_290)]">Already have an account? <Link href="/ads/login?next=/studio" className="underline underline-offset-4">Sign in</Link></p>
    </main>
  );
}
