// studio_probe job: ffprobe an upload (duration/size), poster from the first good frame. Images: dimensions only.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { StudioProbePayloadSchema } from "../../../src/lib/studio/contracts";
import { PermanentJobError, type JobContext } from "../jobs/context";
import { posterFrame, probeMedia } from "./media";

export function posterKeyFor(uploadKey: string): string {
  return uploadKey.replace(/\/[^/]*$/, "/poster.jpg");
}

export async function studioProbeJob(ctx: JobContext): Promise<unknown> {
  const p = StudioProbePayloadSchema.safeParse(ctx.job.payload);
  if (!p.success) throw new PermanentJobError("bad studio_probe payload");
  const up = await ctx.db.studioUpload.findUnique({ where: { id: p.data.uploadId } });
  if (!up) throw new PermanentJobError("upload not found");
  const fail = async (reason: string) => {
    await ctx.db.studioUpload.update({ where: { id: up.id }, data: { status: "failed" } });
    return { ok: false, reason };
  };
  let body: Buffer;
  try {
    body = await ctx.storage.get(up.key);
  } catch (e) {
    if (/NoSuchKey|not found|404/i.test(String(e))) return fail("file missing in storage");
    throw e;
  }
  const dir = await mkdtemp(join(ctx.config.scratchDir, "studio-probe-"));
  try {
    if (up.mime.startsWith("image/")) {
      const m = await sharp(body).metadata().catch(() => null);
      if (!m?.width || !m.height) return fail("not a readable image");
      await ctx.db.studioUpload.update({ where: { id: up.id }, data: { width: m.width, height: m.height, status: "ready" } });
      return { ok: true, width: m.width, height: m.height };
    }
    const file = join(dir, "in");
    await writeFile(file, body);
    const info = await probeMedia(file, ctx.signal);
    if (!info || (!info.hasVideo && !info.hasAudio)) return fail("not a readable video or audio file");
    let posterKey: string | null = null;
    if (info.hasVideo) {
      const jpg = join(dir, "poster.jpg");
      if (await posterFrame(file, jpg, info.durationSec, ctx.signal)) {
        posterKey = posterKeyFor(up.key);
        await ctx.storage.put(posterKey, await readFile(jpg), "image/jpeg");
      }
    }
    await ctx.db.studioUpload.update({ where: { id: up.id }, data: { durationSec: info.durationSec, width: info.width, height: info.height, posterKey, status: "ready" } });
    return { ok: true, durationSec: info.durationSec, width: info.width, height: info.height, posterKey };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
