// Monthly records for the accountant -> docs/ops/records/<YYYY-MM>/ (revenue, refunds, ad-spend, partner-payouts, costs CSVs + summary.md).
// Usage: set -a; . ./.env.local; set +a; npx tsx scripts/ops-export-records.ts [YYYY-MM]   (default: last full month). Read-only on the DB.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { dedupeRevenueEvents, isInternalAccount } from "../src/lib/revenue/economics";
import { FIXED_ITEMS } from "../src/lib/ops/finance/data";
import { loadFinance } from "../src/lib/ops/finance/load";
import { dollars, recordsMarkdown, toCsv } from "../src/lib/ops/finance/records";
import { periodBounds } from "../src/lib/ops/finance/pnl";

async function main() {
  const db = new PrismaClient();
  const now = new Date();
  const arg = process.argv[2];
  const month = arg && /^\d{4}-\d{2}$/.test(arg) ? arg : periodBounds("month", now).label;
  const from = new Date(`${month}-01T00:00:00Z`);
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const range = { gte: from, lt: to };
  const [pay, refunds, spend, paid] = await Promise.all([
    db.adsEvent.findMany({ where: { name: { in: ["purchased", "renewed", "paid_converted"] }, createdAt: range }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, workspaceId: true, props: true, createdAt: true } }),
    db.adsRefund.findMany({ where: { createdAt: range }, orderBy: { createdAt: "asc" } }),
    db.adsEvent.findMany({ where: { name: "ad_spend", createdAt: range }, orderBy: { createdAt: "asc" }, select: { props: true, createdAt: true } }),
    db.adsCommission.findMany({ where: { status: "paid", paidAt: range }, orderBy: { paidAt: "asc" } }),
  ]);
  const wsIds = [...new Set([...pay.map((p) => p.workspaceId), ...refunds.map((r) => r.workspaceId)].filter((x): x is string => !!x))];
  const owners = await db.adsWorkspace.findMany({ where: { id: { in: wsIds } }, select: { id: true, ownerId: true } });
  const users = await db.user.findMany({ where: { id: { in: owners.map((o) => o.ownerId) } }, select: { id: true, email: true } });
  const email = new Map(users.map((u) => [u.id, u.email]));
  const internal = new Set(owners.filter((o) => isInternalAccount(email.get(o.ownerId))).map((o) => o.id));
  const real = dedupeRevenueEvents(pay.filter((p) => p.workspaceId && !internal.has(p.workspaceId)));
  const amt = (p: any) => (typeof p?.amountCents === "number" ? p.amountCents : 0);

  const dir = path.join("docs", "ops", "records", month);
  mkdirSync(dir, { recursive: true });
  const w = (f: string, s: string) => writeFileSync(path.join(dir, f), s);
  w("revenue.csv", toCsv(["date", "event_id", "workspace_id", "type", "amount_usd"], real.map((p) => [p.createdAt, p.id, p.workspaceId, p.name, dollars(amt(p.props))])));
  w("refunds.csv", toCsv(["date", "workspace_id", "stripe_refund_id", "amount_usd", "reason"], refunds.filter((r) => !internal.has(r.workspaceId)).map((r) => [r.createdAt, r.workspaceId, r.stripeRefundId, dollars(r.amountCents), r.reason])));
  w("ad-spend.csv", toCsv(["date", "amount_usd", "source"], spend.map((s) => [(s.props as any)?.day ?? s.createdAt, dollars(amt(s.props)), (s.props as any)?.source ?? ""])));
  w("partner-payouts.csv", toCsv(["paid_at", "partner_id", "referred_workspace_id", "commission_usd", "payout_reference"], paid.map((c) => [c.paidAt, c.partnerId, c.referredWorkspaceId, dollars(c.commissionCents), c.payoutRef])));
  const fin = await loadFinance(db, FIXED_ITEMS, new Date(to.getTime() + 1), process.env); // "now" just after the month so it is the last full month
  const p = fin.month.label === month ? fin.month : null;
  w("costs.csv", toCsv(["item", "monthly_usd", "note"], [
    ...FIXED_ITEMS.map((i) => [i.name, dollars(i.monthlyCents), i.monthlyCents === null ? "UNKNOWN: owner to fill" : ""]),
    ["AI inference (engine AdRun cost)", dollars(p?.costOfRevenue.aiCents ?? null), p ? "measured" : "month not computable"],
    ["Meta ad spend", dollars(p?.acquisition.metaCents ?? null), p?.acquisition.metaCents == null ? "UNKNOWN" : "Meta Insights"],
    ["Kly cost", dollars(p?.acquisition.klyCents ?? null), ""],
  ]));
  const payouts = paid.reduce((t, c) => t + c.commissionCents, 0);
  const summary = { month, grossCents: real.reduce((t, x) => t + amt(x.props), 0), refundsCents: refunds.filter((r) => !internal.has(r.workspaceId)).reduce((t, r) => t + r.amountCents, 0), netCents: 0, costOfRevenueCents: p?.costOfRevenue.totalCents ?? 0, metaSpendCents: p?.acquisition.metaCents ?? null, fixedCents: p?.fixedCents ?? 0, partnerPayoutsCents: payouts, unknown: p?.needsInput ?? ["month cost totals not computable"] };
  summary.netCents = summary.grossCents - summary.refundsCents;
  w("summary.md", recordsMarkdown(summary));
  console.log(`wrote ${dir} (${real.length} payments, ${refunds.length} refunds, ${spend.length} spend days)`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
