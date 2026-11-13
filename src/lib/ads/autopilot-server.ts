// Ozzy Autopilot: read/write the workspace's settings + the latest drop (dashboard card, /api/ads/autopilot, MCP tools).
import type { AdsWorkspace } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AUTOPILOT_UPGRADE_HREF, autopilotEligible, autopilotSettings, dropTimeLabel, nextDropLabel, type AutopilotPatch, type AutopilotSettings } from "./autopilot";
import { WEEKLY_KIND, WEEKLY_STARTED, weeklyDropDecision, weeklyDropEnabled, weeklyDropTitle } from "./weekly-drop";

export interface AutopilotView {
  eligible: boolean;
  enabled: boolean;
  focus: string | null;
  includeVideo: boolean;
  /** "Monday 9am" */
  dropTime: string;
  /** "Next drop: Monday 9am" | "Next drop: on its way" | "Autopilot is off" */
  nextDrop: string;
  upgradeUrl: string | null;
  lastDrop: null | {
    runId: string;
    title: string;
    status: string;
    url: string;
    ads: { id: string; headline: string; thumbnailUrl: string }[];
    video: null | { sessionId: string; url: string; status: "making" | "ready" | "not_made"; posterUrl: string | null };
  };
}

type Ws = Pick<AdsWorkspace, "id" | "adsPlan" | "subscriptionStatus" | "suspendedAt">;

async function settingsFor(workspaceId: string): Promise<AutopilotSettings> {
  return autopilotSettings(await prisma.adsAutopilot.findUnique({ where: { workspaceId } }));
}

export async function loadAutopilot(ws: Ws, now: Date = new Date()): Promise<AutopilotView> {
  const eligible = autopilotEligible(ws);
  const s = await settingsFor(ws.id);
  const enabled = eligible && s.enabled && weeklyDropEnabled();
  let dueNow = false;
  let lastDrop: AutopilotView["lastDrop"] = null;
  if (eligible) {
    const evs = await prisma.adsEvent.findMany({ where: { name: WEEKLY_STARTED, workspaceId: ws.id }, select: { props: true } });
    const weeksDone = evs.flatMap((e) => {
      const w = (e.props as Record<string, unknown> | null)?.week;
      return typeof w === "string" ? [w] : [];
    });
    dueNow = weeklyDropDecision({ now, tz: s.timezone, enabled, subscribed: true, weeksDone, dayOfWeek: s.dayOfWeek, hour: s.hour }).due;
    const run = await prisma.adRun.findFirst({
      where: { workspaceId: ws.id, kind: WEEKLY_KIND },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, status: true, ads: { where: { status: "ready" }, orderBy: { index: "asc" }, take: 6, select: { id: true, headline: true, assets: { where: { mime: { startsWith: "image/" } }, orderBy: { createdAt: "asc" }, take: 1, select: { id: true } } } } },
    });
    if (run) {
      const started = await prisma.adsEvent.findFirst({ where: { name: WEEKLY_STARTED, runId: run.id }, select: { props: true } });
      const week = (started?.props as Record<string, unknown> | null)?.week;
      const session = typeof week === "string" ? await prisma.studioSession.findFirst({ where: { workspaceId: ws.id, autopilotWeek: week }, select: { id: true, status: true, renders: { orderBy: { version: "desc" }, take: 1, select: { id: true, posterKey: true } } } }) : null;
      const render = session?.renders[0];
      lastDrop = {
        runId: run.id,
        title: weeklyDropTitle(run.createdAt, s.timezone),
        status: run.status,
        url: `/ads/runs/${run.id}`,
        ads: run.ads.flatMap((a) => (a.assets[0] ? [{ id: a.id, headline: a.headline, thumbnailUrl: `/api/ads/assets/${a.assets[0].id}/preview` }] : [])),
        video: session
          ? { sessionId: session.id, url: `/studio/${session.id}`, status: render ? "ready" : session.status === "queued" || session.status === "working" ? "making" : "not_made", posterUrl: render?.posterKey ? `/api/studio/media?render=${render.id}&kind=poster` : null }
          : null,
      };
    }
  }
  return {
    eligible,
    enabled,
    focus: s.focus,
    includeVideo: s.includeVideo,
    dropTime: dropTimeLabel(s.dayOfWeek, s.hour),
    nextDrop: eligible ? nextDropLabel({ settings: { ...s, enabled }, dueNow }) : "Included with Ozzy Ad Department",
    upgradeUrl: eligible ? null : AUTOPILOT_UPGRADE_HREF,
    lastDrop,
  };
}

export type SaveAutopilotResult = { ok: true; view: AutopilotView } | { ok: false; code: "not_eligible"; message: string };

/** Upsert the settings row (eligible plans only); the focus applies to the next drop. */
export async function saveAutopilot(ws: Ws, patch: AutopilotPatch, userId: string, now: Date = new Date()): Promise<SaveAutopilotResult> {
  if (!autopilotEligible(ws)) return { ok: false, code: "not_eligible", message: "Ozzy Autopilot is included with Ozzy Ad Department. See plans to turn it on." };
  const data = { ...patch, ...("focus" in patch ? { focusUpdatedAt: now } : {}) };
  await prisma.adsAutopilot.upsert({ where: { workspaceId: ws.id }, create: { workspaceId: ws.id, ...data }, update: data });
  await prisma.adsEvent.create({ data: { name: "autopilot_updated", workspaceId: ws.id, userId, props: { fields: Object.keys(patch).sort(), ...("enabled" in patch ? { enabled: patch.enabled } : {}) } } });
  return { ok: true, view: await loadAutopilot(ws, now) };
}
