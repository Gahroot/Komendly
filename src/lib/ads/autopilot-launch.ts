// Server-side eligibility for the Growth Autopilot first-month offer ($97, then the founding $297/month).
// Rules (founder, 2026-11-26): only workspaces with a FINISHED free pack, for AUTOPILOT_LAUNCH_WINDOW_DAYS after the pack
// finished, once per workspace (a paid "purchased" AdsEvent with key autopilot_launch). Founding spots are checked
// separately at checkout (founding-spots.ts). Derived, never stored. A founder extension (offer_extended) reopens it.
import { prisma } from "@/lib/prisma";
import { AUTOPILOT_LAUNCH, isLaunchOfferOpen, launchOfferExpiresAt, withOfferExtension } from "./billing-config";
import { getOfferExtensionUntil } from "./launch-offer";

export interface AutopilotLaunchState {
  open: boolean;
  expiresAt: Date | null;
  /** The workspace already used the first-month price. */
  used: boolean;
}

/** Pure: window + one-use rule. `finishedAt` = when the first free pack finished (null = not finished). */
export function autopilotLaunchState(finishedAt: Date | null, used: boolean, now: Date, extensionUntil: Date | null = null): AutopilotLaunchState {
  const base = { open: isLaunchOfferOpen(finishedAt, now, AUTOPILOT_LAUNCH), expiresAt: launchOfferExpiresAt(finishedAt, AUTOPILOT_LAUNCH) };
  // An extension never bypasses "finished pack" or "once per workspace".
  const ext = finishedAt ? withOfferExtension(base, extensionUntil, now) : base;
  return { open: ext.open && !used, expiresAt: ext.expiresAt, used };
}

export async function getAutopilotLaunchState(workspaceId: string, now: Date = new Date()): Promise<AutopilotLaunchState> {
  const [run, usedEvent, ext] = await Promise.all([
    prisma.adRun.findFirst({ where: { workspaceId, isTrial: true, completedAt: { not: null }, status: { in: ["completed", "partial"] } }, orderBy: { completedAt: "asc" }, select: { completedAt: true } }),
    prisma.adsEvent.findFirst({ where: { workspaceId, name: "purchased", props: { path: ["key"], equals: AUTOPILOT_LAUNCH.key } }, select: { id: true } }),
    getOfferExtensionUntil(workspaceId),
  ]);
  return autopilotLaunchState(run?.completedAt ?? null, Boolean(usedEvent), now, ext);
}
