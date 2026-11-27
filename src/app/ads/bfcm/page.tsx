import Link from "next/link";
import { redirect } from "next/navigation";
import { AdsNav } from "@/components/ads/ads-nav";
import { BfcmOffer } from "@/components/ads/bfcm-offer";
import { getCurrentUser } from "@/lib/auth";
import { BFCM_ENDED_LINE } from "@/lib/ads/bfcm";
import { getBfcmState } from "@/lib/ads/bfcm-server";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";

export const metadata = { title: "Black Friday offer", robots: { index: false, follow: false } };

/** Signed-in BFCM offer (linked from pricing): the $9 unlock if there's a free pack, and the annual prepay plans. */
export default async function AdsBfcmPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`/ads/signup?next=${encodeURIComponent("/ads/bfcm")}`);
  const ws = await getOrCreateWorkspace(user);
  const state = await getBfcmState(ws);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn />
      <main className="mx-auto max-w-4xl px-4 py-10">
        {state && (state.unlockAvailable || state.annual.length > 0) ? (
          <BfcmOffer state={state} placement="bfcm_page" showAnnual />
        ) : (
          <div className="space-y-3 rounded-2xl border p-6">
            <p className="font-semibold">{state ? "There's nothing in the Black Friday offer for this account right now." : BFCM_ENDED_LINE}</p>
            <p className="text-sm text-muted-foreground">You can still see every plan on the pricing page.</p>
            <Link href="/ads/billing" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Go to billing</Link>
          </div>
        )}
      </main>
    </div>
  );
}
