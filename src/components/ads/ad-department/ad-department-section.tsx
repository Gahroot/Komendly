// "Your Ad Department" section on /ads/app: the three Ozzy Ad Department bonuses (or locked previews for non-members).
// Server-safe: takes a plain view model, imports no server-only modules.
import Link from "next/link";
import { CalendarDays, ClipboardCheck, Lock, Sparkles } from "lucide-react";
import type { AdDepartmentView, BonusCard } from "@/lib/ads/bonuses/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ICONS = { website_checkup: ClipboardCheck, ad_plan: CalendarDays, hook_library: Sparkles } as const;

const STATUS_LINE: Record<BonusCard["status"], string> = {
  ready: "",
  working: "Ozzy is working on this. It shows up here in a few minutes.",
  needs_ads: "Ozzy builds this as soon as you have your first ads.",
  needs_site: "Make your first ads from your website and Ozzy gets started.",
};

export function AdDepartmentSection({ view }: { view: AdDepartmentView }) {
  const total = view.cards.reduce((a, c) => a + c.valueUsd, 0);
  return (
    <section aria-labelledby="ad-department" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ad-department" className="text-xl font-semibold tracking-tight">Your Ad Department</h2>
        <p className="text-sm text-muted-foreground">{view.member ? "Ozzy keeps these fresh for you." : `$${total} of extras, included with Ozzy Ad Department.`}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {view.cards.map((c) => {
          const Icon = view.member ? ICONS[c.kind] : Lock;
          return (
            <Card key={c.kind} className={view.member ? "" : "opacity-90"}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-semibold"><Icon aria-hidden className="size-4" />{c.title}</CardTitle>
                <CardDescription>{c.blurb}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">${c.valueUsd} value{view.member ? " · included" : ""}</p>
                {!view.member ? (
                  <Button asChild size="sm" variant="outline"><Link href="/ads/pricing">Unlock with Ad Department</Link></Button>
                ) : c.status === "ready" ? (
                  <Button asChild size="sm"><Link href={`/ads/app/department/${c.kind}`}>Open</Link></Button>
                ) : (
                  <p className="text-sm text-muted-foreground">{STATUS_LINE[c.status]}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
