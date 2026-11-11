import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { giftByToken, giftView } from "@/lib/ads/gifts";
import { getObjectStream } from "@/lib/ads/storage";
import { OG_SIZE, ozzyDataUrl, studioOg } from "@/lib/og/studio-og";

export const alt = "Free ads made with Komendly";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 300;

async function firstAdDataUrl(token: string, adId: string): Promise<string | null> {
  const asset = await prisma.adAsset.findFirst({ where: { adId, mime: { startsWith: "image/" } }, orderBy: { ratio: "asc" }, select: { storageKey: true, mime: true } });
  if (!asset || !token) return null;
  const buf = Buffer.from(await new Response(await getObjectStream(asset.storageKey)).arrayBuffer());
  return `data:${asset.mime};base64,${buf.toString("base64")}`;
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gift = await giftByToken(token);
  const ozzy = await ozzyDataUrl("classic-love");
  if (!gift) return studioOg({ headline: "Free ads, made from your website", headlineSize: 76, ozzy });
  const g = await giftView(gift);
  const headline = `${g.senderName} made you 3 ads for ${g.businessName}`;
  const ad = g.ads[0] ? await firstAdDataUrl(token, g.ads[0].id).catch(() => null) : null;
  if (!ad) return studioOg({ headline, headlineSize: 64, pill: "Free · tap to see them", ozzy });
  const font = await readFile(path.join(process.cwd(), "src", "lib", "og", "fonts", "fraunces-500.ttf"));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "linear-gradient(180deg,#0c0820 0%,#2b1556 70%,#6b2f4a 100%)", fontFamily: "Fraunces", padding: 60 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 600 }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 32, color: "#fff1d6" }}>
            <div style={{ width: 16, height: 16, background: "#ffcf4a", transform: "rotate(45deg)", marginRight: 14 }} />Komendly
          </div>
          <div style={{ marginTop: 30, fontSize: 60, lineHeight: 1.05, color: "#fff1d6", letterSpacing: -1.5 }}>{headline}</div>
          <div style={{ display: "flex", marginTop: 34 }}>
            <div style={{ background: "#ffcf4a", color: "#2a0f10", fontSize: 28, padding: "12px 26px", borderRadius: 999 }}>Free · tap to see them</div>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ad} width={480} height={480} alt="" style={{ marginLeft: 40, borderRadius: 24, border: "8px solid #2a1846", transform: "rotate(2deg)" }} />
      </div>
    ),
    { ...OG_SIZE, fonts: [{ name: "Fraunces", data: font, weight: 500, style: "normal" }] },
  );
}
