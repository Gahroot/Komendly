// Server helpers for Ozzy reels: which S3 key serves a reel (external voiced.mp4 beats the silent render).
import { prisma } from "@/lib/prisma";
import { REEL_EVENTS, type ReelReadyProps } from "./reels-core";

export const REEL_ID_RE = /^[A-Za-z0-9_-]{6,120}$/;

export async function reelVideoKey(reelId: string): Promise<{ key: string; voiced: boolean } | null> {
  if (!REEL_ID_RE.test(reelId)) return null;
  const ready = await prisma.adsEvent.findFirst({ where: { name: REEL_EVENTS.ready, props: { path: ["reelId"], equals: reelId } }, orderBy: { createdAt: "desc" }, select: { props: true } });
  if (!ready) return null;
  const voiced = await prisma.adsEvent.findFirst({ where: { name: REEL_EVENTS.voiced, props: { path: ["reelId"], equals: reelId } }, orderBy: { createdAt: "desc" }, select: { props: true } });
  const vk = (voiced?.props as { key?: string } | null)?.key;
  return vk ? { key: vk, voiced: true } : { key: (ready.props as unknown as ReelReadyProps).key, voiced: false };
}
