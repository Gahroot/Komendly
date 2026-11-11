// Read an A/B test from the funnel events (prod: point DATABASE_URL at prod, read-only).
// Usage: npx tsx --env-file=.env.local scripts/experiment-readout.ts [experiment=free_ads_demo] [days=60]
// Counts unique visitors per arm (visit_landed.props.exp), how many went on to sign up (signed_up.props.exp), and a two-proportion z-test.
import { PrismaClient } from "@prisma/client";
import { isInternalEmail } from "../src/lib/internal-email";

async function main() {
  const key = process.argv[2] ?? "free_ads_demo";
  const days = Number(process.argv[3] ?? 60);
  const prisma = new PrismaClient();
  // Internal/test accounts (src/lib/internal-email.ts) and the browsers they signed up from don't count.
  const internalUsers = (await prisma.user.findMany({ select: { id: true, email: true } })).filter((u) => isInternalEmail(u.email)).map((u) => u.id);
  const internalAnon = (await prisma.adsEvent.findMany({ where: { name: "signed_up", userId: { in: internalUsers } }, select: { props: true } }))
    .map((s) => (s.props as { anonId?: unknown } | null)?.anonId).filter((a): a is string => typeof a === "string");
  const rows = await prisma.$queryRawUnsafe<{ arm: string; visitors: number; engaged: number; signups: number }[]>(
    `with v as (
       select props->'exp'->>$1 arm, count(distinct props->>'anonId')::int visitors from "AdsEvent"
       where name = 'visit_landed' and props->>'bot' is null and not (coalesce(props->>'anonId', '') = any($3::text[])) and props->'exp' ? $1 and "createdAt" > now() - make_interval(days => $2::int) group by 1),
     e as (
       select l.props->'exp'->>$1 arm, count(distinct g.props->>'anonId')::int engaged from "AdsEvent" g
       join "AdsEvent" l on l.name = 'visit_landed' and l.props->>'anonId' = g.props->>'anonId' and l.props->'exp' ? $1
       where g.name = 'visit_engaged' and not (coalesce(g.props->>'anonId', '') = any($3::text[])) and g."createdAt" > now() - make_interval(days => $2::int) group by 1),
     s as (
       select props->'exp'->>$1 arm, count(*)::int signups from "AdsEvent"
       where name = 'signed_up' and not (coalesce("userId", '') = any($4::text[])) and props->'exp' ? $1 and "createdAt" > now() - make_interval(days => $2::int) group by 1)
     select v.arm, v.visitors, coalesce(e.engaged, 0) engaged, coalesce(s.signups, 0) signups
     from v left join e using (arm) left join s using (arm) order by v.arm`,
    key, days, internalAnon, internalUsers,
  );
  await prisma.$disconnect();
  if (!rows.length) return console.log(`No visits recorded for ${key} yet.`);
  for (const r of rows) console.log(`${r.arm.padEnd(10)} visitors ${String(r.visitors).padStart(6)}  engaged ${pct(r.engaged, r.visitors)}  signups ${String(r.signups).padStart(4)} (${pct(r.signups, r.visitors)})`);
  const [a, b] = [rows.find((r) => r.arm === "control"), rows.find((r) => r.arm !== "control")];
  if (!a || !b) return;
  const p1 = a.signups / a.visitors, p2 = b.signups / b.visitors, p = (a.signups + b.signups) / (a.visitors + b.visitors);
  const z = (p2 - p1) / Math.sqrt(p * (1 - p) * (1 / a.visitors + 1 / b.visitors) || 1);
  console.log(`\n${b.arm} vs control: ${p1 ? (((p2 - p1) / p1) * 100).toFixed(0) : "n/a"}% relative, z = ${z.toFixed(2)} (|z| >= 1.96 is a real difference at 95%; below that, keep collecting).`);
}
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "-");
main().catch((e) => { console.error(e); process.exit(1); });
