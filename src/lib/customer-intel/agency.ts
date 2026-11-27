// Agency dashboard rules: one row per client brand, next suggested action, bulk-drop selection, export naming. Pure.
import { nextBestAction, type NextAction } from "./next-action";

export interface ClientRow {
  brandId: string;
  name: string;
  domain: string;
  logoUrl?: string | null;
  latestRun: { id: string; status: string; createdAt: string; readyAds: number; creditsCharged: number } | null;
  approval: "none" | "waiting" | "approved" | "changes";
  creditsUsed30d: number;
  adsLive: boolean;
  metaConnected: boolean;
}

export type RowView = ClientRow & { next: NextAction; ageDays: number | null };

export function clientRows(rows: ClientRow[], now: Date, ctx: { credits: number; dropCost: number }): RowView[] {
  return rows.map((r) => {
    const ageDays = r.latestRun ? Math.floor((now.getTime() - new Date(r.latestRun.createdAt).getTime()) / 86_400_000) : null;
    const next = nextBestAction({
      paid: true, runStatus: r.latestRun?.status ?? null, readyAds: r.latestRun?.readyAds ?? 0, downloaded: true,
      approvalPending: r.approval === "waiting", changesRequested: r.approval === "changes", metaConnected: r.metaConnected, adsLive: r.adsLive,
      credits: ctx.credits, dropCost: ctx.dropCost, daysSinceLastPack: ageDays,
    });
    return { ...r, next, ageDays };
  });
}

/** Clients that should get a drop this week: nothing in flight and no pack in the last `minDays` days. */
export function dueForDrop(rows: RowView[], minDays = 6): string[] {
  const busy = new Set(["extracting", "awaiting_confirm", "queued", "generating"]);
  return rows.filter((r) => !(r.latestRun && busy.has(r.latestRun.status)) && (r.ageDays === null || r.ageDays >= minDays)).map((r) => r.brandId);
}

export type DropPlan = { ok: true; brandIds: string[]; cost: number } | { ok: false; reason: string; cost?: number };

/** Server-side guard for a bulk drop: dedupes, caps, and checks the credit pool covers every selected client (the real reserve still runs per run). */
export function planBulkDrop(i: { selected: string[]; valid: Set<string>; perRunCost: number; credits: number; unlimited: boolean; max?: number }): DropPlan {
  const ids = [...new Set(i.selected)].filter((id) => i.valid.has(id));
  const max = i.max ?? 10; // startRun allows 10 runs per user per hour; the Agency plan covers 10 client brands
  if (!ids.length) return { ok: false, reason: "Choose at least one client." };
  if (ids.length > max) return { ok: false, reason: `Pick up to ${max} clients at a time.` };
  const cost = i.unlimited ? 0 : ids.length * i.perRunCost;
  if (cost > i.credits) return { ok: false, reason: `This needs ${cost} credits and you have ${i.credits}. Pick fewer clients or top up.`, cost };
  return { ok: true, brandIds: ids, cost };
}

/** ISO week key, e.g. "2026-W48": the idempotency window for a bulk drop. */
export function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7)).padStart(2, "0")}`;
}

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "client";
/** Client-ready export name: <client>_<week>_<n>-<ratio>.<ext>; never mentions Komendly. */
export function exportFileName(client: string, week: string, n: number, ratio: string, ext = "png"): string {
  return `${slug(client)}_${week.toLowerCase()}_${String(n).padStart(2, "0")}-${ratio.replace(":", "x")}.${ext}`;
}
