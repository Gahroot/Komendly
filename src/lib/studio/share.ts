// Public share page data for /s/<token> (no auth: token-checked, presigned URLs only).
import { prisma } from "@/lib/prisma";
import { presignGet } from "@/lib/ads/storage";

export function isPlausibleShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{8,40}$/.test(token);
}

export async function loadShare(token: string, opts: { countView?: boolean } = {}) {
  if (!isPlausibleShareToken(token)) return null;
  const r = await prisma.studioRender.findUnique({
    where: { shareToken: token },
    select: { id: true, key: true, posterKey: true, ratio: true, seconds: true, version: true, watermarked: true, workspaceId: true, createdAt: true, session: { select: { title: true } } },
  });
  if (!r) return null;
  if (opts.countView) await prisma.studioRender.update({ where: { id: r.id }, data: { shareViews: { increment: 1 } } }).catch(() => undefined);
  const [videoUrl, posterUrl] = await Promise.all([presignGet(r.key, { seconds: 600 }), r.posterKey ? presignGet(r.posterKey, { seconds: 600 }) : Promise.resolve(null)]);
  return { token, title: r.session.title, ratio: r.ratio, seconds: r.seconds, version: r.version, watermarked: r.watermarked, videoUrl, posterUrl, createdAt: r.createdAt.toISOString() };
}
