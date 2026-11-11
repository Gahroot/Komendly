// DEV ONLY: play the engine for one Ozzy Studio turn so the web chat can be tested end to end.
// Claims the oldest queued studio_turn AdJob, streams realistic StudioEvent rows over ~10s, uploads a tiny mp4 + poster
// (made with ffmpeg) to dev S3 under studio/..., creates the StudioRender row and finishes the turn.
//   set -a; . ./.env.local; set +a; npx tsx scripts/studio-fake-turn.ts [--question] [--wait]
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { putObject } from "../src/lib/ads/storage";
import { studioCharge, studioKeys, StudioTurnPayloadSchema, STUDIO_TURN_JOB_TYPE } from "../src/lib/studio/contracts";

config({ path: ".env.local" });
const prisma = new PrismaClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ask = process.argv.includes("--question") || process.argv.includes("--questions");
/** --questions: one ask_user with 3 questions (3 question events), like the engine's multi-question asks. */
const askMany = process.argv.includes("--questions");
const wait = process.argv.includes("--wait");
/** --slow: stretch the turn (~30s) so Stop / reload mid-stream can be tested. */
const slow = process.argv.includes("--slow");

async function claim() {
  for (let i = 0; i < (wait ? 120 : 1); i++) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      UPDATE "AdJob" SET status = 'running', "lockedBy" = 'fake-turn', "lockedAt" = now(), attempts = attempts + 1
      WHERE id = (SELECT id FROM "AdJob" WHERE type = ${STUDIO_TURN_JOB_TYPE} AND status = 'queued' ORDER BY priority DESC, "runAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING id`;
    if (rows[0]) return prisma.adJob.findUniqueOrThrow({ where: { id: rows[0].id } });
    if (wait) await sleep(1000);
  }
  return null;
}

async function main() {
  const job = await claim();
  if (!job) {
    console.log("No queued studio_turn job.");
    return;
  }
  const p = StudioTurnPayloadSchema.parse(job.payload);
  const session = await prisma.studioSession.findUniqueOrThrow({ where: { id: p.sessionId }, include: { workspace: true } });
  const ws = session.workspace;
  const messageId = p.assistantMessageId;
  console.log(`Claimed ${job.id} for session ${session.id}`);
  const cancelled = async () => (await prisma.adJob.findUnique({ where: { id: job.id }, select: { status: true } }))?.status === "canceled";
  const ev = async (type: string, data: Record<string, unknown>) => {
    if (await cancelled()) throw new Error("cancelled");
    await prisma.studioEvent.create({ data: { sessionId: session.id, messageId, type, data: data as object } });
  };
  // Like the engine (turn.ts nameSession): title the chat after its first exchange.
  const nameSession = async () => {
    if ((await prisma.studioMessage.count({ where: { sessionId: session.id } })) <= 2) await prisma.studioSession.update({ where: { id: session.id }, data: { title: "Bold promo for Komendly" } });
  };
  const say = async (text: string) => {
    let buf = "";
    for (const word of text.split(/(?<= )/)) {
      buf += word;
      if (buf.length > 14) {
        await ev("text_delta", { text: buf });
        buf = "";
        await sleep(150);
      }
    }
    if (buf) await ev("text_delta", { text: buf });
  };

  try {
    await prisma.studioSession.update({ where: { id: session.id }, data: { status: "working" } });
    await prisma.studioMessage.update({ where: { id: messageId }, data: { status: "streaming" } });
    await ev("status", { phase: "thinking", label: "Ozzy is thinking" });
    await sleep(700);
    if (ask) {
      const text = "Love it. Before I start, one quick choice so it fits where you'll post it:";
      await say(text);
      await ev("question", { question: "Which format should I make first?", options: [{ label: "9:16 vertical", value: "9:16", hint: "Reels, TikTok, Stories", recommended: true }, { label: "1:1 square", value: "1:1", hint: "Feed posts" }, { label: "16:9 wide", value: "16:9", hint: "YouTube, website" }], allowOther: true });
      if (askMany) {
        await ev("question", { question: "How long should it be?", options: [{ label: "6 seconds", value: "6" }, { label: "15 seconds", value: "15", recommended: true }, { label: "30 seconds", value: "30" }], allowOther: true });
        await ev("question", { question: "What vibe?", options: [{ label: "Bold and punchy", value: "bold", recommended: true }, { label: "Calm and premium", value: "calm" }], allowOther: false });
      }
      await nameSession();
      await ev("done", { messageId });
      await prisma.studioMessage.update({ where: { id: messageId }, data: { status: "done", content: text } });
      await prisma.studioSession.update({ where: { id: session.id }, data: { status: "awaiting_user", lastActivityAt: new Date() } });
      await prisma.adJob.update({ where: { id: job.id }, data: { status: "succeeded", finishedAt: new Date() } });
      return;
    }
    const intro = "G'day! Here's the plan for your video:\n\n- **Hook** in the first second with a bold headline\n- Three quick scenes showing what you do\n- A gold call to action to finish\n\nI'll build it now.";
    await say(intro);
    await ev("status", { phase: "building", label: "Building scenes" });
    for (const t of ["Writing the script", "Building scene 1: the hook", "Building scene 2: the proof", "Building scene 3: the call to action"]) {
      await ev("tool", { label: t });
      await sleep(slow ? 3000 : 800);
    }
    const version = (await prisma.studioRender.count({ where: { sessionId: session.id } })) + 1;
    const dir = mkdtempSync(path.join(tmpdir(), "studio-fake-"));
    const mp4 = path.join(dir, "v.mp4");
    const jpg = path.join(dir, "v.jpg");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=540x960:rate=30:duration=6", "-f", "lavfi", "-i", "sine=frequency=440:duration=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", mp4]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "2", "-i", mp4, "-frames:v", "1", jpg]);
    const previewKey = studioKeys.preview(ws.id, session.id, `v${version}-frame.jpg`);
    await putObject(previewKey, readFileSync(jpg), "image/jpeg");
    await ev("preview", { key: previewKey, caption: "Scene 2, frame check" });
    await ev("status", { phase: "rendering", label: "Rendering your video" });
    for (let pct = 0; pct <= 100; pct += 10) {
      await ev("progress", { pct, label: pct < 100 ? `Rendering frame ${Math.round(pct * 1.8)} of 180` : "Encoding", ...(pct > 0 && pct < 100 ? { etaSec: Math.round((100 - pct) / 10) * 0.6 + 1 } : {}) });
      await sleep(slow ? 1500 : 600);
    }
    await ev("status", { phase: "reviewing", label: "Checking every frame" });
    const key = studioKeys.render(ws.id, session.id, version);
    const posterKey = studioKeys.poster(ws.id, session.id, version);
    await putObject(key, readFileSync(mp4), "video/mp4");
    await putObject(posterKey, readFileSync(jpg), "image/jpeg");
    const paid = ws.adsPlan !== "trial" && ["active", "trialing", "past_due"].includes(ws.subscriptionStatus);
    const charge = studioCharge({ priorRenders: version - 1, seconds: 6, sessionFree: session.freeVideo, freeVideosLeft: ws.studioFreeVideos, isPaidWorkspace: paid });
    const render = await prisma.$transaction(async (tx) => {
      const r = await tx.studioRender.create({
        data: { sessionId: session.id, messageId, workspaceId: ws.id, version, key, posterKey, ratio: "9:16", seconds: 6, width: 540, height: 960, watermarked: charge.watermark, free: charge.useFreeVideo, kind: charge.kind, creditsCharged: charge.credits },
      });
      if (charge.useFreeVideo) await tx.adsWorkspace.update({ where: { id: ws.id }, data: { studioFreeVideos: { decrement: 1 }, studioOfferReadyAt: ws.studioOfferReadyAt ?? new Date() } });
      return r;
    });
    await ev("render", { renderId: render.id, version, ratio: "9:16", seconds: 6, watermarked: charge.watermark, posterKey });
    await ev("charge", { renderId: render.id, credits: charge.credits, free: charge.useFreeVideo, freeVideosLeft: Math.max(0, ws.studioFreeVideos - (charge.useFreeVideo ? 1 : 0)) });
    const outro = `\n\nHere's **v${version}** (9:16, 6s). Want a square version, different music, or a punchier hook?`;
    await say(outro);
    await nameSession();
    await ev("done", { messageId });
    await prisma.studioMessage.update({ where: { id: messageId }, data: { status: "done", content: intro + outro, attachments: [{ renderId: render.id }] } });
    await prisma.studioSession.update({ where: { id: session.id }, data: { status: "idle", lastActivityAt: new Date() } });
    await prisma.adJob.update({ where: { id: job.id }, data: { status: "succeeded", finishedAt: new Date() } });
    console.log(`Delivered render v${version} (${render.id})`);
  } catch (error) {
    if (error instanceof Error && error.message === "cancelled") console.log("Turn was cancelled by the user.");
    else throw error;
  }
}

main().finally(() => prisma.$disconnect());
