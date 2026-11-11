// Make good a Studio turn whose final render failed: re-render the saved project and deliver it as a new version,
// free and without a watermark, with a short apology from Ozzy. Does not touch the workspace's free videos or credits.
// Dry run (renders to --out only): set -a; . ../.env.local; set +a; DATABASE_URL=<db> npx tsx scripts/studio-redeliver.ts --session <id> --out /tmp/x.mp4
// Deliver: add --apply [--message "..."]
import { mkdtemp, readFile, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { studioKeys, STUDIO_MAX_SECONDS } from "../../src/lib/studio/contracts";
import { createDb } from "../src/db";
import { renderComposition } from "../src/modules/ezmotion/runtime";
import { createStorage } from "../src/storage/s3";
import { finalizeDelivery, posterFrame, probeMedia, ratioOf } from "../src/studio/media";
import { changedComposition, unpackProject } from "../src/studio/project";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const sessionId = arg("session");
const apply = process.argv.includes("--apply");
if (!sessionId) { console.error("usage: --session <id> [--out file.mp4] [--apply] [--message text]"); process.exit(2); }

const db = createDb();
const storage = createStorage();
const s = await db.studioSession.findUniqueOrThrow({ where: { id: sessionId } });
if (!s.projectKey) throw new Error("session has no saved project");
const root = await mkdtemp(join(tmpdir(), "redeliver-"));
const tgz = join(root, "p.tar.gz");
await writeFile(tgz, await storage.get(s.projectKey));
const project = join(root, "project");
await (await import("node:fs/promises")).mkdir(project);
if (!(await unpackProject(tgz, project))) throw new Error("unpack failed");
const comp = await changedComposition(project, 0);
if (!comp) throw new Error("no composition in project");
console.log("composition", comp.slice(project.length));
const raw = join(root, "render.mp4");
const rr = await renderComposition(comp, raw, { fps: 30, timeoutMs: 15 * 60_000, quality: "standard" });
if (rr.code !== 0) throw new Error(`render failed: ${(rr.stderr || rr.stdout).slice(-500)}`);
const info = await probeMedia(raw);
if (!info?.hasVideo || !info.width || !info.height) throw new Error("render is not a video");
const out = join(root, "final.mp4");
const fin = await finalizeDelivery({ input: raw, output: out, maxSeconds: STUDIO_MAX_SECONDS.paid, watermark: false, width: info.width, height: info.height, hasAudio: info.hasAudio, pngPath: join(root, "wm.png") });
if (!fin.ok) throw new Error(`finalize failed: ${fin.error}`);
const final = await probeMedia(out);
console.log("rendered", { ms: rr.ms, width: info.width, height: info.height, seconds: final?.durationSec, audio: info.hasAudio });
if (arg("out")) await copyFile(out, arg("out") as string);
if (!apply) { console.log("dry run: nothing delivered"); process.exit(0); }

const version = (await db.studioRender.count({ where: { sessionId } })) + 1;
const key = studioKeys.render(s.workspaceId, sessionId, version);
const posterKey = studioKeys.poster(s.workspaceId, sessionId, version);
await storage.put(key, await readFile(out), "video/mp4");
const jpg = join(root, "poster.jpg");
const hasPoster = await posterFrame(out, jpg, final?.durationSec ?? null);
if (hasPoster) await storage.put(posterKey, await readFile(jpg), "image/jpeg");
const content = arg("message") ?? "Sorry about that! My renderer hiccuped last time, so your video never arrived. Here it is, on the house: no watermark, and your free video is still waiting for whatever you want next.";
const seconds = final?.durationSec ?? info.durationSec ?? 0;
const ratio = ratioOf(info.width, info.height);
const r = await db.$transaction(async (tx) => {
  const msg = await tx.studioMessage.create({ data: { sessionId, role: "assistant", content, status: "done" } });
  const render = await tx.studioRender.create({
    data: { sessionId, messageId: msg.id, workspaceId: s.workspaceId, version, key, posterKey: hasPoster ? posterKey : null, ratio, seconds, width: info.width ?? 1080, height: info.height ?? 1920, watermarked: false, free: true, kind: "new", creditsCharged: 0 },
  });
  await tx.studioMessage.update({ where: { id: msg.id }, data: { attachments: [{ renderId: render.id }] } });
  await tx.studioEvent.createMany({ data: [
    { sessionId, messageId: msg.id, type: "text_delta", data: { text: content } },
    { sessionId, messageId: msg.id, type: "render", data: { renderId: render.id, version, ratio, seconds: Math.round(seconds * 10) / 10, watermarked: false, ...(hasPoster ? { posterKey } : {}) } },
    { sessionId, messageId: msg.id, type: "done", data: { messageId: msg.id } },
  ] });
  await tx.studioSession.update({ where: { id: sessionId }, data: { status: "idle", lastActivityAt: new Date() } });
  return { messageId: msg.id, renderId: render.id };
});
console.log("delivered", { ...r, version, key });
await db.$disconnect();
