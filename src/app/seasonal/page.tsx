import type { Metadata } from "next";
import Link from "next/link";
import { HubShell } from "@/components/hubs/hub-shell";
import { activeSeasons, daysUntilWindow, seasonWindowLabel } from "@/lib/growth/creative-hubs";
import { SEASONS } from "@/lib/growth/trade-playbooks";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Seasonal ad releases by industry", description: "What to advertise this season, by trade: calendar-driven ad ideas for Black Friday, spring, tax season and more.", alternates: { canonical: "/seasonal" } };

export default function Page() {
  const now = new Date();
  const active = new Set(activeSeasons(now).map((s) => s.key));
  return (
    <HubShell title="Seasonal ad releases" lead="Each season has a window to start your ads. Pick one for ideas by trade.">
      <ul className="space-y-3">
        {SEASONS.map((s) => { const d = daysUntilWindow(s.key, now); return (
          <li key={s.key}><Link href={`/seasonal/${s.key}`} className="block rounded-2xl border border-border p-5 hover:bg-white/[0.04]">
            <span className="font-display text-xl">{s.name}</span>{active.has(s.key) && <span className="ml-2 rounded-full bg-[var(--studio-gold)] px-2 py-0.5 text-xs font-semibold text-[#2a0f10]">Start now</span>}
            <span className="mt-1 block text-sm text-muted-foreground">Start window: {seasonWindowLabel(s.key)}{d ? ` (opens in ${d} days)` : ""}</span>
          </Link></li>); })}
      </ul>
    </HubShell>
  );
}
