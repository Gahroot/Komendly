"use client";

import { Card, CardContent } from "@/components/ui/card";

const EXTRACT_FINDS = ["Who you sell to", "The pains your customers describe", "Proof: reviews, stats, logos", "Your colours, fonts and logo"];
const PLAN_FINDS = ["The strongest angles", "Hooks in your customers' words", "Layouts for your first ads"];

/** What Ozzy is working on while the engine extracts or plans. Honest: a checklist of what this step covers, no timers or fake percentages. */
export function RunProgress({ phase, domain }: { phase: "extracting" | "planning"; domain: string }) {
  const items = phase === "extracting" ? EXTRACT_FINDS : PLAN_FINDS;
  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardContent className="space-y-4 py-4">
        <p className="font-medium">{phase === "extracting" ? `Reading ${domain} for:` : "Planning your ads:"}</p>
        <ul className="space-y-2.5">
          {items.map((t, i) => (
            <li key={t} className="flex items-center gap-3 text-sm text-muted-foreground">
              <span aria-hidden className="studio-dot size-2 shrink-0 bg-[var(--studio-gold)]" style={{ animationDelay: `${i * 220}ms` }} />
              {t}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          {phase === "extracting" ? "Usually under a minute. You'll get 30 seconds to check what Ozzy found." : "Your first ad usually lands within 3 minutes."}
        </p>
      </CardContent>
    </Card>
  );
}
