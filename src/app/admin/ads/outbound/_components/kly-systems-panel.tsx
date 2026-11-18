import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { systemEnabled } from "@/lib/growth/systems";

// Small admin view of the growth systems Kly runs (review_gifts, new_business). Health/kill switches live on the money dashboard.
const SYSTEMS = [
  { key: "review_gifts", label: "Review-video gifts" },
  { key: "new_business", label: "New-business timing" },
] as const;
const EVENTS = ["system_lead_found", "system_gift_made", "system_email_sent", "system_gift_viewed"] as const;

export async function KlySystemsPanel({ now }: { now: Date | string | number }) {
  const since = new Date(new Date(now).getTime() - 7 * 86_400_000);
  const rows = await Promise.all(
    SYSTEMS.map(async (s) => {
      const [on, counts, leads, signups] = await Promise.all([
        systemEnabled(prisma, s.key),
        Promise.all(EVENTS.map((name) => prisma.adsEvent.count({ where: { name, createdAt: { gte: since }, props: { path: ["system"], equals: s.key } } }))),
        prisma.outboundLead.count({ where: { system: s.key } }),
        prisma.outboundLead.count({ where: { system: s.key, signedUpAt: { not: null } } }),
      ]);
      return { ...s, on, counts, leads, signups };
    }),
  );
  const videos = await prisma.klyReviewGift.findMany({ where: { status: "ready" }, orderBy: { readyAt: "desc" }, take: 5, select: { token: true, businessName: true, costMicros: true, viewCount: true } });
  const capEnv = Number(process.env.REVIEW_GIFT_DAILY_CAP ?? 3);
  const presEnv = Number(process.env.REVIEW_GIFT_PRESENTER_DAILY_CAP ?? 0);
  return (
    <section className="rounded-3xl border border-[var(--studio-gold)]/15 bg-[oklch(0.2_0.07_295/0.62)] p-5 sm:p-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]/80">Growth systems on Kly · last 7 days</p>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground"><tr><th>System</th><th>Switch</th><th>Leads</th><th>Gifts</th><th>Sent</th><th>Viewed</th><th>All leads</th><th>Sign-ups</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-border">
              <td className="py-1.5">{r.label}</td><td>{r.on ? "on" : `off (sys_${r.key})`}</td>
              {r.counts.map((c, i) => <td key={i} className="tabular-nums">{c}</td>)}
              <td className="tabular-nums">{r.leads}</td><td className="tabular-nums">{r.signups}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted-foreground">Review videos: {Number.isFinite(capEnv) ? Math.max(0, Math.min(10, Math.floor(capEnv))) : 3}/day quote videos ($0, engine-rendered); paid AI presenter {Number.isFinite(presEnv) ? Math.max(0, Math.min(5, Math.floor(presEnv))) : 0}/day (REVIEW_GIFT_PRESENTER_DAILY_CAP, ~$2.10 each, 0 = off).{videos.length ? " Latest: " : ""}
        {videos.map((v, i) => <span key={v.token}>{i ? ", " : ""}<Link href={`/gift/review/${v.token}`} target="_blank" className="underline">{v.businessName}</Link> (${(Number(v.costMicros) / 1e6).toFixed(2)}, {v.viewCount} views)</span>)}
      </p>
    </section>
  );
}
