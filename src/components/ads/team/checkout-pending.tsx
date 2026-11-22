"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { OzzyImg } from "./team-bits";

/** Back from Stripe before the payment webhook landed: re-check every few seconds (the webhook switches the plan on). */
export function CheckoutPending() {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= 20) return;
    const t = setTimeout(() => { router.refresh(); setTries((n) => n + 1); }, 3000);
    return () => clearTimeout(t);
  }, [tries, router]);
  return (
    <div role="status" className="flex items-center gap-4 rounded-2xl border border-primary/40 bg-primary/10 p-5">
      <OzzyImg src="/brand/ozzy-joyful-happy.png" size={72} />
      <div className="space-y-1">
        <p className="font-display text-xl">Payment received. Welcome to the team!</p>
        {tries < 20
          ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Confirming your plan with Stripe. This page moves on by itself.</p>
          : <p className="text-sm text-muted-foreground">This is taking longer than usual. Refresh the page in a minute, or check Billing.</p>}
      </div>
    </div>
  );
}
