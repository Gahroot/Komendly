import { prisma } from "@/lib/prisma";
import { OG_SIZE, ozzyDataUrl, studioOg } from "@/lib/og/studio-og";
import { isPlausibleShareToken } from "@/lib/studio/share";

// Reads Ozzy PNGs + the Fraunces font from disk: next.config.ts outputFileTracingIncludes has "/s/[token]/opengraph-image".
export const alt = "A video made with Ozzy";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 300;

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = isPlausibleShareToken(token)
    ? await prisma.studioRender.findUnique({ where: { shareToken: token }, select: { session: { select: { title: true } } } })
    : null;
  const ozzy = await ozzyDataUrl("developer-excited");
  const headline = r ? r.session.title : "Made by chatting with Ozzy";
  return studioOg({ label: "Studio", headline, headlineSize: headline.length > 40 ? 56 : 72, pill: "Make yours free with Ozzy", ozzy });
}
