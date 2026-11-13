// Hosted "Ozzy" MCP server (stateless Streamable HTTP). Every tool runs as the API key's user (runAsAgent) and goes
// through the same route handlers / gates as the web app: credits, free video, trial pack, unlimited limits, email gate.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AdsHttpError, isPaidWorkspace, requireWorkspaceMember } from "@/lib/ads/workspace";
import { assertSafeTargetUrl } from "@/lib/ads/abuse";
import { presignGet } from "@/lib/ads/storage";
import { getBalance } from "@/lib/ads/credits";
import { loadRunView } from "@/lib/ads/run-view";
import { canServeAsset } from "@/lib/ads/bonus-access";
import { isBonusUnlocked } from "@/lib/ads/bonus-unlock";
import { downloadNeedsVerifiedEmail, DOWNLOAD_GATE_MESSAGE } from "@/lib/ads/download-gate";
import { STUDIO_UPLOAD_LIMITS } from "@/lib/studio/contracts";
import { requireStudioSession, studioAccess, workspaceOwnsKey } from "@/lib/studio/server";
import { POST as createSessionRoute, GET as listSessionsRoute } from "@/app/api/studio/sessions/route";
import { POST as sendMessageRoute } from "@/app/api/studio/sessions/[id]/messages/route";
import { POST as remixRoute } from "@/app/api/studio/remix/route";
import { POST as launchRoute } from "@/app/api/studio/launch/route";
import { POST as createUploadRoute } from "@/app/api/studio/uploads/route";
import { POST as completeUploadRoute } from "@/app/api/studio/uploads/[id]/complete/route";
import { POST as startRunRoute, GET as listRunsRoute } from "@/app/api/ads/runs/route";
import { POST as confirmRunRoute } from "@/app/api/ads/runs/[id]/confirm/route";
import { GET as assetDownloadRoute } from "@/app/api/ads/assets/[id]/download/route";
import { AUTOPILOT_FOCUS_MAX, parseAutopilotPatch } from "@/lib/ads/autopilot";
import { loadAutopilot, saveAutopilot } from "@/lib/ads/autopilot-server";
import { currentAgent } from "./context";
import { callRoute, type RouteResult } from "./internal-call";
import { UPGRADE_URL } from "./policy";
import { checkJobLimit, JOB_LIMIT_MESSAGE } from "./resolve";

export const MCP_INSTRUCTIONS =
  "Ozzy by Komendly makes videos and ads for the signed-in Komendly user, on their plan and credits. Use studio_launch_video to turn what was just shipped into a launch video recorded from the real product. Use studio_remix with a link to any ad to get its style and structure rebuilt for the user's brand. Use studio_create_video to have Ozzy make a short video from a prompt (optionally with footage added first via upload_media), then studio_send_message to edit it (\"make it 9:16\", \"add captions\"); studio_get_session and studio_list_sessions show progress, replies and fresh video links. Use ads_create_pack to turn a website into an Ad Pack (static and optionally animated ads), then ads_get_run to follow it and get the ad images; ads_list_runs lists packs. get_download_url gives a fresh short-lived link for an ad asset or a video render, and get_account shows the plan, credits and free videos left. autopilot_get / autopilot_set read and change Ozzy Autopilot (weekly ads + video, steered by a one-sentence focus). Videos take a few minutes: when a tool says Ozzy is still working, check back with the get tool instead of starting again. When a tool returns an upgrade_url, pass it to the human; never invent payment steps.";

const WAIT_MS = 50_000;
const POLL_MS = 2_000;
const MAX_BASE64_BYTES = 8 * 1024 * 1024;
const MB = 1024 * 1024;

export interface McpRequestInfo {
  origin: string;
  headers: Headers;
}

type Structured = Record<string, unknown>;
type ToolResult = { content: { type: "text"; text: string }[]; structuredContent: Structured; isError?: boolean };

function ok(text: string, data: Structured): ToolResult {
  return { content: [{ type: "text", text: `${text}\n\n${JSON.stringify(data, null, 2)}` }], structuredContent: data };
}

function fail(message: string, extra: Structured = {}): ToolResult {
  const data = { error: message, ...extra };
  const text = extra.upgrade_url ? `${message} Upgrade or top up: ${String(extra.upgrade_url)}` : message;
  return { content: [{ type: "text", text }], structuredContent: data, isError: true };
}

/** Plain, user-facing failure (with the upgrade link where paying would fix it). */
class ToolFailure extends Error {
  constructor(message: string, public extra: Structured = {}) {
    super(message);
  }
}

const UPGRADE_CODES = new Set(["insufficient_credits", "no_credits", "free_used", "trial_used", "device_used", "ip_used", "domain_used", "brand_limit", "busy", "too_large", "locked", "job_limited"]);

function studioPaywallMessage(code: unknown, needed: unknown): string {
  const n = typeof needed === "number" ? needed : null;
  if (code === "free_used") return `Your free Ozzy video is used up. This one needs ${n ?? "some"} credits: pick a plan or top up to keep going.`;
  return `This needs ${n ?? "more"} credits and the account doesn't have enough. Top up or upgrade to continue.`;
}

/** Route error -> ToolFailure with a plain sentence (+ upgrade_url on payment/limit errors). */
function routeFailure(r: RouteResult): ToolFailure {
  const code = typeof r.json.code === "string" ? r.json.code : "";
  let message = typeof r.json.error === "string" && r.json.error ? r.json.error : "Something went wrong. Please try again.";
  if (r.status === 402 && (code === "no_credits" || code === "free_used")) message = studioPaywallMessage(code, r.json.neededCredits);
  if (r.status === 401) message = "This API key is no longer valid. Create a new one at https://www.komendly.com/dashboard/api.";
  if (r.status === 404) message = "Not found. Check the id; it must belong to this account.";
  const upgrade = r.status === 402 || UPGRADE_CODES.has(code);
  return new ToolFailure(message, { code: code || `http_${r.status}`, ...(upgrade ? { upgrade_url: UPGRADE_URL } : {}) });
}

function agentOrThrow() {
  const agent = currentAgent();
  if (!agent) throw new ToolFailure("This API key is no longer valid.");
  return agent;
}

async function run(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ToolFailure) return fail(error.message, error.extra);
    if (error instanceof AdsHttpError) {
      const upgrade = error.status === 402 || UPGRADE_CODES.has(error.code);
      return fail(error.message, { code: error.code, ...(upgrade ? { upgrade_url: UPGRADE_URL } : {}) });
    }
    console.error("[mcp] tool failed", error);
    return fail("Something went wrong on Komendly's side. Please try again in a moment.");
  }
}

async function requireJobSlot(): Promise<void> {
  if (!(await checkJobLimit(agentOrThrow().keyId))) throw new ToolFailure(JOB_LIMIT_MESSAGE, { code: "job_limited" });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------------------------------------------
// Studio

async function renderOut(r: { id: string; key: string; posterKey: string | null; seconds: number; ratio: string; watermarked: boolean; version: number }) {
  return {
    render_id: r.id,
    version: r.version,
    url: await presignGet(r.key, { seconds: 600, downloadName: `ozzy-v${r.version}-${r.ratio.replace(":", "x")}.mp4` }),
    poster_url: r.posterKey ? await presignGet(r.posterKey, { seconds: 600 }) : null,
    seconds: r.seconds,
    ratio: r.ratio,
    watermarked: r.watermarked,
  };
}

function viewUrl(info: McpRequestInfo, path: string): string {
  return new URL(path, info.origin).toString();
}

/** Wait (up to ~50s) for the session to leave queued/working. */
async function waitForSession(sessionId: string, deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    const s = await prisma.studioSession.findUnique({ where: { id: sessionId }, select: { status: true } });
    if (!s || (s.status !== "queued" && s.status !== "working")) return;
    await sleep(POLL_MS);
  }
}

/** Status + Ozzy's reply to `assistantMessageId` (or the latest) + the video it produced. */
async function turnResult(info: McpRequestInfo, sessionId: string, assistantMessageId: string | null) {
  const { session } = await requireStudioSession(sessionId);
  const msg = assistantMessageId
    ? await prisma.studioMessage.findFirst({ where: { id: assistantMessageId, sessionId } })
    : await prisma.studioMessage.findFirst({ where: { sessionId, role: "assistant" }, orderBy: { createdAt: "desc" } });
  const render = msg
    ? await prisma.studioRender.findFirst({ where: { sessionId, messageId: msg.id }, orderBy: { version: "desc" } })
    : null;
  const working = session.status === "queued" || session.status === "working";
  const data: Structured = {
    session_id: session.id,
    status: working ? "working" : msg?.status === "error" ? "error" : session.status,
    ...(msg && !working && msg.content ? { reply: msg.content } : {}),
    ...(msg?.error ? { error: "Ozzy hit a problem with this one. Try rephrasing, or send the message again." } : {}),
    ...(render ? { video: await renderOut(render) } : {}),
    view_url: viewUrl(info, `/studio/${session.id}`),
  };
  const text = working
    ? "Ozzy is still working on it. Check back with studio_get_session in a minute (videos usually take a few minutes)."
    : render
      ? `Ozzy made a ${render.seconds.toFixed(0)}s ${render.ratio} video.`
      : session.status === "awaiting_user"
        ? "Ozzy has a question: answer it with studio_send_message."
        : "Ozzy replied.";
  return ok(text, data);
}

async function sendTurn(info: McpRequestInfo, sessionId: string, message: string, uploadIds: string[], wait: boolean) {
  await requireJobSlot();
  const sent = await callRoute(sendMessageRoute, { ...route(info), method: "POST", path: `/api/studio/sessions/${sessionId}/messages`, body: { content: message, uploadIds }, params: { id: sessionId } });
  if (sent.status >= 400) throw routeFailure(sent);
  const assistant = sent.json.assistantMessage as { id?: string } | undefined;
  if (wait) await waitForSession(sessionId, Date.now() + WAIT_MS);
  return turnResult(info, sessionId, assistant?.id ?? null);
}

function route(info: McpRequestInfo) {
  return { origin: info.origin, incoming: info.headers };
}

// ---------------------------------------------------------------------------------------------------------------
// Uploads

function filenameFromUrl(u: URL, mime: string): string {
  const last = decodeURIComponent(u.pathname.split("/").pop() ?? "").replace(/[^\w.\-]+/g, "_");
  if (last && /\.\w{2,4}$/.test(last)) return last.slice(-120);
  return `upload.${mime.split("/")[1] ?? "bin"}`;
}

/** Fetch a public URL (SSRF-checked on every redirect hop), capped at `maxBytes`. */
async function fetchPublicMedia(raw: string, maxBytes: number): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string; filename: string }> {
  let current = raw;
  for (let hop = 0; hop < 4; hop++) {
    let target: URL;
    try {
      target = await assertSafeTargetUrl(current);
    } catch {
      throw new ToolFailure("That URL isn't a public web address Ozzy can fetch.");
    }
    const res = await fetch(target, { redirect: "manual", signal: AbortSignal.timeout(45_000) }).catch(() => null);
    if (!res) throw new ToolFailure("Couldn't download that URL. Check it's public and try again.");
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location") ?? "", target).toString();
      continue;
    }
    if (!res.ok || !res.body) throw new ToolFailure(`Couldn't download that URL (it answered ${res.status}).`);
    const mime = (res.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    if (!(STUDIO_UPLOAD_LIMITS.mimes as readonly string[]).includes(mime)) throw new ToolFailure("Ozzy can use MP4, MOV, WebM, PNG, JPG, WebP, MP3, WAV or M4A files, and that URL isn't one of them.");
    const declared = Number(res.headers.get("content-length"));
    if (declared > maxBytes) throw tooLarge(maxBytes);
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw tooLarge(maxBytes);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      bytes.set(c, off);
      off += c.byteLength;
    }
    return { bytes, mime, filename: filenameFromUrl(target, mime) };
  }
  throw new ToolFailure("That URL redirects too many times.");
}

function tooLarge(maxBytes: number): ToolFailure {
  return new ToolFailure(`That file is over the ${Math.round(maxBytes / MB)} MB limit for this plan.`, { code: "too_large", upgrade_url: UPGRADE_URL });
}

async function uploadBytes(info: McpRequestInfo, file: { bytes: Uint8Array<ArrayBuffer>; mime: string; filename: string }) {
  const created = await callRoute(createUploadRoute, { ...route(info), method: "POST", path: "/api/studio/uploads", body: { filename: file.filename, mime: file.mime, bytes: file.bytes.byteLength } });
  if (created.status >= 400) throw routeFailure(created);
  const upload = created.json.upload as { id: string };
  const putUrl = String(created.json.putUrl);
  const put = await fetch(putUrl, { method: "PUT", body: file.bytes, headers: { "Content-Type": file.mime }, signal: AbortSignal.timeout(120_000) }).catch(() => null);
  if (!put?.ok) throw new ToolFailure("The upload didn't go through. Please try again.");
  const done = await callRoute(completeUploadRoute, { ...route(info), method: "POST", path: `/api/studio/uploads/${upload.id}/complete`, params: { id: upload.id } });
  if (done.status >= 400) throw routeFailure(done);
  return ok(`Uploaded ${file.filename}. Pass upload_ids: ["${upload.id}"] to studio_create_video or studio_send_message.`, { upload_id: upload.id, filename: file.filename, mime: file.mime, bytes: file.bytes.byteLength });
}

// ---------------------------------------------------------------------------------------------------------------
// Ads

async function runOut(info: McpRequestInfo, runId: string) {
  const { user, workspace } = await requireWorkspaceMember({ runId });
  let view = await loadRunView(runId);
  if (!view) throw new ToolFailure("Not found. Check the run id.");
  if (view.status === "awaiting_confirm") {
    // Agents accept the extracted brand as-is (the human can still review it on the run page before the deadline).
    const confirmed = await callRoute(confirmRunRoute, { ...route(info), method: "POST", path: `/api/ads/runs/${runId}/confirm`, body: { corrections: {} }, params: { id: runId } });
    if (confirmed.status >= 400) throw routeFailure(confirmed);
    view = (await loadRunView(runId)) ?? view;
  }
  const gated = downloadNeedsVerifiedEmail({ isTrial: view.isTrial, isPaid: isPaidWorkspace(workspace), emailVerified: Boolean(user.emailVerifiedAt) });
  const unlocked = await isBonusUnlocked(workspace);
  const assetIds = view.ads.flatMap((a) => a.assets.map((x) => x.id));
  const rows = assetIds.length
    ? await prisma.adAsset.findMany({ where: { id: { in: assetIds } }, select: { id: true, storageKey: true, ratio: true, ad: { select: { visualBrief: true } } } })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ads = [];
  for (const ad of view.ads) {
    const assets = [];
    for (const a of ad.assets) {
      const row = byId.get(a.id);
      const servable = row && !gated && ad.status === "ready" && canServeAsset({ visualBrief: row.ad.visualBrief, assetRatio: row.ratio, unlocked, use: "download" });
      assets.push({ asset_id: a.id, ratio: a.ratio, url: servable && row ? await presignGet(row.storageKey, { seconds: 600 }) : null });
    }
    ads.push({ ad_id: ad.id, kind: ad.kind, headline: ad.headline, status: ad.status, ...(ad.locked ? { locked: true } : {}), assets });
  }
  const ready = view.ads.filter((a) => a.status === "ready").length;
  const total = view.staticCount + view.motionCount;
  const settled = ["completed", "partial", "failed", "canceled"].includes(view.status);
  const data: Structured = {
    run_id: view.id,
    website: view.url,
    status: view.status,
    progress: { ready, total },
    ...(view.error ? { error: "This pack ran into a problem. Open it on Komendly to retry." } : {}),
    ...(gated && ready > 0 ? { download_note: DOWNLOAD_GATE_MESSAGE } : {}),
    ...(view.ads.some((a) => a.locked) ? { upgrade_url: UPGRADE_URL } : {}),
    ads,
    view_url: viewUrl(info, `/ads/runs/${view.id}`),
  };
  const text = settled ? `Ad Pack ${view.status}: ${ready} of ${total} ads ready.` : `Ad Pack is ${view.status}: ${ready} of ${total} ads ready so far. Check again in a minute.`;
  return ok(text, data);
}

// ---------------------------------------------------------------------------------------------------------------

/** One stateless server per HTTP request. Must run inside runAsAgent(). */
export function buildOzzyServer(info: McpRequestInfo): McpServer {
  const server = new McpServer({ name: "ozzy", title: "Ozzy by Komendly", version: "1.0.0" }, { instructions: MCP_INSTRUCTIONS });

  server.registerTool("get_account", { title: "Account", description: "Plan, credit balance, free Ozzy Studio videos left and whether the free Ad Pack was used.", inputSchema: {}, annotations: { readOnlyHint: true } }, () =>
    run(async () => {
      const { workspace } = await studioAccess();
      const paid = isPaidWorkspace(workspace);
      const data = {
        plan: paid ? workspace.adsPlan : "free",
        credits: await getBalance(workspace.id),
        free_studio_videos_left: paid ? 0 : workspace.studioFreeVideos,
        free_pack_used: paid || workspace.trialUsedAt !== null,
        upgrade_url: UPGRADE_URL,
      };
      return ok(`Plan: ${data.plan}. Credits: ${data.credits}. Free Ozzy videos left: ${data.free_studio_videos_left}.`, data);
    }),
  );

  server.registerTool("autopilot_get", { title: "Ozzy Autopilot", description: "Ozzy Autopilot: whether it's on, this week's focus, the next drop time and last week's ads and video.", inputSchema: {}, annotations: { readOnlyHint: true } }, () =>
    run(async () => {
      const { workspace } = await studioAccess();
      const v = await loadAutopilot(workspace);
      if (!v.eligible) return ok("Ozzy Autopilot is included with Ozzy Ad Department.", { ...v, upgrade_url: "https://www.komendly.com/pricing?utm_source=autopilot" });
      return ok(`Autopilot is ${v.enabled ? "ON" : "OFF"}. ${v.nextDrop}. Focus: ${v.focus ?? "none (Ozzy picks)"}.`, { ...v });
    }),
  );

  server.registerTool(
    "autopilot_set",
    { title: "Change Ozzy Autopilot", description: "Turn Ozzy Autopilot on/off and/or set the one-sentence focus for the next weekly drop (empty focus = Ozzy picks).", inputSchema: { enabled: z.boolean().optional(), focus: z.string().max(AUTOPILOT_FOCUS_MAX).optional() } },
    ({ enabled, focus }) =>
      run(async () => {
        const agent = agentOrThrow();
        const { workspace } = await studioAccess();
        const parsed = parseAutopilotPatch({ ...(enabled !== undefined ? { enabled } : {}), ...(focus !== undefined ? { focus } : {}) });
        if (!parsed.ok) throw new ToolFailure(parsed.error);
        const r = await saveAutopilot(workspace, parsed.patch, agent.user.id);
        if (!r.ok) throw new ToolFailure(r.message, { code: r.code, upgrade_url: "https://www.komendly.com/pricing?utm_source=autopilot" });
        return ok(`Saved. Autopilot is ${r.view.enabled ? "ON" : "OFF"}. ${r.view.nextDrop}. Focus: ${r.view.focus ?? "none (Ozzy picks)"}.`, { ...r.view });
      }),
  );

  const waitArg = z.boolean().optional().describe("Wait up to ~50s for Ozzy's reply/video (default true). Otherwise returns right away.");
  const uploadIdsArg = z.array(z.string().min(1).max(64)).max(STUDIO_UPLOAD_LIMITS.maxFilesPerMessage).optional().describe("upload_id values from upload_media to use as footage.");

  server.registerTool(
    "studio_create_video",
    { title: "Make a video with Ozzy", description: "Start a new Ozzy Studio chat and ask Ozzy for a video (animation, edit of uploaded footage, promo...). Uses the free video or credits like the web app.", inputSchema: { prompt: z.string().min(1).max(8000), upload_ids: uploadIdsArg, wait: waitArg } },
    ({ prompt, upload_ids, wait }) =>
      run(async () => {
        await requireJobSlot();
        const created = await callRoute(createSessionRoute, { ...route(info), method: "POST", path: "/api/studio/sessions", body: { prompt } });
        if (created.status >= 400) throw routeFailure(created);
        const sessionId = String((created.json.session as { id: string }).id);
        return sendTurn(info, sessionId, prompt, upload_ids ?? [], wait ?? true);
      }),
  );

  server.registerTool(
    "studio_send_message",
    { title: "Message Ozzy", description: "Send a follow-up in an Ozzy Studio chat: edits like \"make it 9:16\", \"add captions\", or answers to Ozzy's questions.", inputSchema: { session_id: z.string().min(1).max(64), message: z.string().min(1).max(8000), upload_ids: uploadIdsArg, wait: waitArg } },
    ({ session_id, message, upload_ids, wait }) => run(() => sendTurn(info, session_id, message, upload_ids ?? [], wait ?? true)),
  );

  server.registerTool(
    "studio_remix",
    {
      title: "Remix an ad with Ozzy",
      description: "Show Ozzy any ad (a YouTube/Shorts, TikTok, Instagram, Facebook Ad Library or X link, a direct video/image link, or a page with the ad) and Ozzy rebuilds its structure and style (hook, pacing, text, transitions) for the user's own brand. Never copies the original's footage, logos or words. Counts like any Ozzy video (free first video, credits after).",
      inputSchema: {
        url: z.string().min(4).max(2000).describe("Link to the ad to remix."),
        notes: z.string().max(2000).optional().describe("Anything to change, e.g. the offer to feature."),
        aspect: z.enum(["9:16", "1:1", "4:5", "16:9"]).optional().describe("Output shape; defaults to the reference's."),
        wait: waitArg,
      },
    },
    ({ url, notes, aspect, wait }) =>
      run(async () => {
        await requireJobSlot();
        const started = await callRoute(remixRoute, { ...route(info), method: "POST", path: "/api/studio/remix", body: { url, notes, aspect } });
        if (started.status >= 400) throw routeFailure(started);
        const sessionId = String((started.json.session as { id: string }).id);
        const assistant = started.json.assistantMessage as { id?: string } | undefined;
        if (wait ?? true) await waitForSession(sessionId, Date.now() + WAIT_MS);
        return turnResult(info, sessionId, assistant?.id ?? null);
      }),
  );

  server.registerTool(
    "studio_launch_video",
    {
      title: "Make a launch video",
      description: "When the user says \"make a launch video for what we just shipped\": Ozzy opens their live product, records it (real clips and screenshots) and cuts a 20-40s launch video with captions and a call to action. Only for public http(s) addresses. For localhost, staging or anything behind a login, tell the user to run `npx komendly launch <url> --notes \"...\"` in their project instead (it records on their machine). Put what shipped in notes (e.g. from recent commits). Counts like any Ozzy video (free first video, credits after).",
      inputSchema: {
        url: z.string().min(4).max(2000).describe("Public address of the product, e.g. https://yourapp.com."),
        notes: z.string().max(4000).describe("What was just shipped, in plain words (features, who it's for)."),
        aspect: z.enum(["16:9", "9:16"]).optional().describe("16:9 (default, for X/YouTube/landing pages) or 9:16 (for Reels/TikTok)."),
        wait: waitArg,
      },
    },
    ({ url, notes, aspect, wait }) =>
      run(async () => {
        await requireJobSlot();
        const started = await callRoute(launchRoute, { ...route(info), method: "POST", path: "/api/studio/launch", body: { url, notes, aspect } });
        if (started.status >= 400) throw routeFailure(started);
        const sessionId = String((started.json.session as { id: string }).id);
        const assistant = started.json.assistantMessage as { id?: string } | undefined;
        if (wait ?? true) await waitForSession(sessionId, Date.now() + WAIT_MS);
        return turnResult(info, sessionId, assistant?.id ?? null);
      }),
  );

  server.registerTool(
    "studio_get_session",
    { title: "Ozzy chat status", description: "Status, Ozzy's latest reply and every video version (fresh download links) of an Ozzy Studio chat.", inputSchema: { session_id: z.string().min(1).max(64) }, annotations: { readOnlyHint: true } },
    ({ session_id }) =>
      run(async () => {
        const base = await turnResult(info, session_id, null);
        const renders = await prisma.studioRender.findMany({ where: { sessionId: session_id }, orderBy: { version: "asc" } });
        const data = { ...base.structuredContent, renders: await Promise.all(renders.map(renderOut)) };
        delete (data as Structured).video;
        return ok(base.content[0]?.text.split("\n\n")[0] ?? "", data);
      }),
  );

  server.registerTool(
    "studio_list_sessions",
    { title: "List Ozzy chats", description: "Recent Ozzy Studio chats, newest first.", inputSchema: { limit: z.number().int().min(1).max(100).optional() }, annotations: { readOnlyHint: true } },
    ({ limit }) =>
      run(async () => {
        const r = await callRoute(listSessionsRoute, { ...route(info), method: "GET", path: "/api/studio/sessions" });
        if (r.status >= 400) throw routeFailure(r);
        const sessions = ((r.json.sessions as { id: string; title: string; status: string; lastActivityAt: string }[]) ?? []).slice(0, limit ?? 20);
        const data = { sessions: sessions.map((s) => ({ session_id: s.id, title: s.title, status: s.status, last_activity_at: s.lastActivityAt, view_url: viewUrl(info, `/studio/${s.id}`) })) };
        return ok(`${data.sessions.length} chat(s).`, data);
      }),
  );

  server.registerTool(
    "upload_media",
    {
      title: "Upload footage",
      description: "Add a video, image or audio file for Ozzy: either a public http(s) `url` the server downloads, or a small file as `base64` with `filename` and `mime` (up to 8 MB). Returns an upload_id.",
      inputSchema: { url: z.string().url().max(2048).optional(), filename: z.string().min(1).max(200).optional(), mime: z.string().max(80).optional(), base64: z.string().max(12_000_000).optional() },
    },
    ({ url, filename, mime, base64 }) =>
      run(async () => {
        const { workspace } = await studioAccess();
        const max = isPaidWorkspace(workspace) ? STUDIO_UPLOAD_LIMITS.maxBytes : STUDIO_UPLOAD_LIMITS.maxBytesFree;
        if (url) return uploadBytes(info, await fetchPublicMedia(url, max));
        if (!base64 || !filename || !mime) throw new ToolFailure("Give either a public `url`, or `filename`, `mime` and `base64`.");
        const bytes = new Uint8Array(Buffer.from(base64, "base64"));
        if (bytes.byteLength === 0) throw new ToolFailure("That base64 file is empty.");
        if (bytes.byteLength > MAX_BASE64_BYTES) throw new ToolFailure("Files sent as base64 can be up to 8 MB. Share a public URL for bigger files.");
        return uploadBytes(info, { bytes, mime: mime.toLowerCase(), filename });
      }),
  );

  server.registerTool(
    "ads_create_pack",
    { title: "Make an Ad Pack", description: "Turn a website into an Ad Pack of static ads (plus an animated ad when animated=true on paid plans). Uses the free pack or credits like the web app.", inputSchema: { website_url: z.string().min(3).max(2048), animated: z.boolean().optional() } },
    ({ website_url, animated }) =>
      run(async () => {
        await requireJobSlot();
        const r = await callRoute(startRunRoute, { ...route(info), method: "POST", path: "/api/ads/runs", body: { url: website_url, ...(animated ? { motion: true } : {}) } });
        if (r.status >= 400) throw routeFailure(r);
        const runId = String(r.json.runId);
        const out = await runOut(info, runId);
        return ok(`Ad Pack started${r.json.resumed ? " (your free pack was already in progress)" : ""}. Ads take a few minutes: follow it with ads_get_run.`, out.structuredContent);
      }),
  );

  server.registerTool(
    "ads_get_run",
    { title: "Ad Pack status", description: "Status, progress and ads (with fresh image/video links) of an Ad Pack.", inputSchema: { run_id: z.string().min(1).max(64) } },
    ({ run_id }) => run(() => runOut(info, run_id)),
  );

  server.registerTool(
    "ads_list_runs",
    { title: "List Ad Packs", description: "Recent Ad Packs, newest first.", inputSchema: { limit: z.number().int().min(1).max(20).optional() }, annotations: { readOnlyHint: true } },
    ({ limit }) =>
      run(async () => {
        const r = await callRoute(listRunsRoute as unknown as Parameters<typeof callRoute>[0], { ...route(info), method: "GET", path: "/api/ads/runs" });
        if (r.status >= 400) throw routeFailure(r);
        const runs = ((r.json.runs as { id: string; url: string; status: string; createdAt: string; readyCount: number; totalCount: number }[]) ?? []).slice(0, limit ?? 20);
        const data = { runs: runs.map((x) => ({ run_id: x.id, website: x.url, status: x.status, created_at: x.createdAt, ready: x.readyCount, total: x.totalCount, view_url: viewUrl(info, `/ads/runs/${x.id}`) })) };
        return ok(`${data.runs.length} Ad Pack(s).`, data);
      }),
  );

  server.registerTool(
    "get_download_url",
    { title: "Download link", description: "A fresh short-lived download link for an ad asset (asset_id) or an Ozzy video (render_id).", inputSchema: { asset_id: z.string().min(1).max(64).optional(), render_id: z.string().min(1).max(64).optional() } },
    ({ asset_id, render_id }) =>
      run(async () => {
        if (asset_id) {
          const r = await callRoute(assetDownloadRoute, { ...route(info), method: "GET", path: `/api/ads/assets/${asset_id}/download`, params: { id: asset_id } });
          if (r.status >= 400 || !r.location) throw routeFailure(r);
          return ok("Download link (valid for a few minutes).", { url: r.location, expires_in_seconds: 300 });
        }
        if (render_id) {
          const agent = agentOrThrow();
          const r = await prisma.studioRender.findUnique({ where: { id: render_id } });
          if (!r || !(await workspaceOwnsKey(agent.user.id, r.key))) throw new ToolFailure("Not found. Check the render id.");
          return ok("Download link (valid for 10 minutes).", { url: (await renderOut(r)).url, expires_in_seconds: 600 });
        }
        throw new ToolFailure("Give an asset_id (ad image/video) or a render_id (Ozzy video).");
      }),
  );

  return server;
}

