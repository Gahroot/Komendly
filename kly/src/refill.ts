// Growth system "kly_refill" (flag sys_kly_refill, default OFF): once a week, count the unused Ad Library places and the
// unsent verified adlib leads for the top trades. When a trade runs low, write an AdsEvent `kly_refill_needed` so the
// coordinator knows to run the Ad Library pull (scripts/import-adlib.ts). Kly never scrapes the Ad Library itself.
import type { Prisma } from "@prisma/client";
import { parseBeat, recordSystemRun, systemEnabled, systemHeartbeatId } from "../../src/lib/growth/systems";
import type { Db } from "./db";
import { errMsg, log } from "./log";

export const REFILL_SYSTEM = "kly_refill" as const;
/** Kly niches of the top trades (same as the /free-ads trade pages). */
export const TOP_NICHES = ["roofers", "plumbers", "hvac", "landscapers", "house cleaners", "electricians", "pest control", "painters"] as const;
/** Alert when unused adlib places + unsent verified adlib leads for a trade drop below this. */
export const REFILL_THRESHOLD = 150;
export const REFILL_EVERY_MS = 7 * 24 * 3_600_000;
export const REFILL_EVENT = "kly_refill_needed";

export interface NicheStock { niche: string; unusedPlaces: number; verifiedLeads: number }

/** Pure: niches whose stock is below the threshold, lowest first. */
export function lowNiches(stock: readonly NicheStock[], threshold = REFILL_THRESHOLD): NicheStock[] {
  return stock.filter((s) => s.unusedPlaces + s.verifiedLeads < threshold).sort((a, b) => a.unusedPlaces + a.verifiedLeads - (b.unusedPlaces + b.verifiedLeads));
}

/** Pure: is the weekly check due (last heartbeat run older than a week, or never)? */
export function refillDue(lastRunAt: string | null, now: Date): boolean {
  return !lastRunAt || now.getTime() - new Date(lastRunAt).getTime() >= REFILL_EVERY_MS;
}

export async function stockFor(db: Db, niches: readonly string[] = TOP_NICHES): Promise<NicheStock[]> {
  const out: NicheStock[] = [];
  for (const niche of niches) {
    const unusedPlaces = await db.klyPlace.count({ where: { source: "adlib", niche, usedAt: null } });
    const verifiedLeads = await db.outboundLead.count({ where: { source: "adlib", niche, emailCheck: "valid", status: "found" } });
    out.push({ niche, unusedPlaces, verifiedLeads });
  }
  return out;
}

/** One weekly check. Returns the niches flagged (null when off / not due). Never sends or scrapes anything. */
export async function refillCycle(db: Db, now: Date): Promise<NicheStock[] | null> {
  if (!(await systemEnabled(db, REFILL_SYSTEM))) return null;
  const beat = parseBeat((await db.engineHeartbeat.findUnique({ where: { id: systemHeartbeatId(REFILL_SYSTEM) } }).catch(() => null))?.meta);
  if (!refillDue(beat.lastRunAt, now)) return null;
  try {
    const low = lowNiches(await stockFor(db));
    if (low.length) {
      await db.adsEvent.create({ data: { name: REFILL_EVENT, props: { threshold: REFILL_THRESHOLD, niches: low, action: "Run the Ad Library pull (scripts/import-adlib.ts) for these niches", system: REFILL_SYSTEM } as unknown as Prisma.InputJsonValue } });
      log("warn", "kly refill needed", { niches: low.map((n) => n.niche) });
    }
    await recordSystemRun(db, REFILL_SYSTEM, { ok: true, outputs: low.length }, now);
    return low;
  } catch (e) {
    await recordSystemRun(db, REFILL_SYSTEM, { ok: false, error: errMsg(e) }, now);
    throw e;
  }
}
