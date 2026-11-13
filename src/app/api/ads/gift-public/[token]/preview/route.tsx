// Kly "gift on click" email hero: a free preview card (no AI) for a business whose ads Ozzy hasn't drawn yet.
// Night-sky Studio look: stars, ridge, Ozzy, the business name and three empty frames he'll fill when they tap.
import { readFile } from "fs/promises";
import path from "path";
import { ImageResponse } from "next/og";
import { giftByToken } from "@/lib/ads/gifts";
import { cleanBusinessName } from "@/lib/ads/outbound/copy";
import { ridgeHeights, seeded } from "@/components/studio/pixel-art";
import { ozzyDataUrl } from "@/lib/og/studio-og";

const W = 960;
const H = 960;
const CELL = 24;
const FAR = ridgeHeights(40, 5, 4, 2);
const NEAR = ridgeHeights(40, 13, 3, 2);
const STARS = (() => {
  const r = seeded(11);
  return Array.from({ length: 46 }, (_, i) => ({ left: Math.round(r() * W), top: Math.round(r() * 520), size: r() > 0.8 ? 6 : 4, opacity: 0.35 + r() * 0.6, gold: i % 6 === 0 }));
})();
const FRAMES = [
  { tilt: "-5deg", y: 26 },
  { tilt: "2deg", y: 0 },
  { tilt: "6deg", y: 30 },
];

let font: Promise<Buffer> | null = null;

/** Gold sparkle drawn as a rotated square (the font has no ✦ glyph). */
function Diamond({ size }: { size: number }) {
  return <div style={{ display: "flex", width: size, height: size, background: "#ffcf4a", transform: "rotate(45deg)", boxShadow: "0 0 18px rgba(255,207,74,0.7)" }} />;
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const gift = await giftByToken((await params).token);
  if (!gift || gift.source !== "outbound") return new Response("not found", { status: 404 });
  const domain = new URL(gift.recipientUrl).hostname.replace(/^www\./, "");
  const name = cleanBusinessName(gift.recipientName ?? domain).slice(0, 48);
  const nameSize = name.length > 30 ? 56 : name.length > 18 ? 68 : 80;
  const [fraunces, ozzy] = await Promise.all([(font ??= readFile(path.join(process.cwd(), "src", "lib", "og", "fonts", "fraunces-500.ttf"))), ozzyDataUrl("creator-focused")]);
  const img = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", position: "relative", background: "linear-gradient(180deg,#0c0820 0%,#1d0f42 50%,#3a1a4a 78%,#b8513d 100%)", fontFamily: "Fraunces" }}>
        {STARS.map((s, i) => (
          <div key={i} style={{ position: "absolute", left: s.left, top: s.top, width: s.size, height: s.size, background: s.gold ? "#ffcf4a" : "#fff1d6", opacity: s.opacity }} />
        ))}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", alignItems: "flex-end" }}>
          {FAR.map((h, i) => <div key={i} style={{ width: CELL, height: (h + 2) * CELL, background: "#2a1238" }} />)}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", alignItems: "flex-end" }}>
          {NEAR.map((h, i) => <div key={i} style={{ width: CELL, height: h * CELL, background: "#140818" }} />)}
        </div>
        <div style={{ marginTop: 64, display: "flex", alignItems: "center", fontSize: 26, letterSpacing: 6, color: "#ffcf4a" }}>
          <Diamond size={12} />
          <div style={{ display: "flex", margin: "0 18px" }}>OZZY IS READY TO DRAW</div>
          <Diamond size={12} />
        </div>
        <div style={{ marginTop: 26, display: "flex", textAlign: "center", justifyContent: "center", maxWidth: 820, fontSize: nameSize, lineHeight: 1.05, letterSpacing: -2, color: "#fff1d6" }}>{name}</div>
        <div style={{ marginTop: 18, display: "flex", fontSize: 30, color: "#c9b8e8" }}>3 free Facebook ads, drawn from {domain.slice(0, 40)}</div>
        <div style={{ marginTop: 54, display: "flex", alignItems: "flex-start" }}>
          {FRAMES.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 220, height: 275, margin: "0 14px", marginTop: f.y, transform: `rotate(${f.tilt})`, borderRadius: 18, border: "5px dashed #ffcf4a", background: "rgba(255,241,214,0.06)" }}>
              <Diamond size={30} />
            </div>
          ))}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ozzy} width={230} height={230} alt="" style={{ position: "absolute", left: 22, bottom: 34, imageRendering: "pixelated" }} />
        <div style={{ position: "absolute", right: 56, bottom: 70, display: "flex", background: "#ffcf4a", color: "#2a0f10", fontSize: 34, padding: "16px 34px", borderRadius: 999, boxShadow: "0 6px 0 #b8862a" }}>Tap to watch him draw</div>
      </div>
    ),
    { width: W, height: H, fonts: [{ name: "Fraunces", data: await fraunces, weight: 500, style: "normal" }] },
  );
  // Same card for the life of the gift; mail clients' image proxies fetch it once.
  img.headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
  img.headers.set("X-Robots-Tag", "noindex");
  return img;
}
