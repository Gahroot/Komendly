import { readFile } from "fs/promises";
import path from "path";
import { ImageResponse } from "next/og";
import { ridgeHeights, seeded } from "@/components/studio/pixel-art";

export const OG_SIZE = { width: 1200, height: 630 };

export async function ozzyDataUrl(name: string): Promise<string> {
  const buf = await readFile(path.join(process.cwd(), "public", "brand", `ozzy-${name}.png`));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

const STARS = (() => {
  const r = seeded(7);
  return Array.from({ length: 40 }, (_, i) => ({
    left: Math.round(r() * 1200),
    top: Math.round(r() * 380),
    size: r() > 0.8 ? 6 : 4,
    opacity: 0.35 + r() * 0.6,
    gold: i % 7 === 0,
  }));
})();
const CELL = 24;
const FAR = ridgeHeights(50, 3, 5, 2);
const NEAR = ridgeHeights(50, 11, 3, 2);

type Props = { label?: string; headline: string; headlineSize: number; pill?: string; ozzy: string };

let fraunces: Promise<Buffer> | null = null;
/** Fraunces 500 (OFL), vendored so OG rendering never needs the network. */
function loadFraunces(): Promise<Buffer> {
  return (fraunces ??= readFile(path.join(process.cwd(), "src", "lib", "og", "fonts", "fraunces-500.ttf")));
}

export async function studioOg({ label, headline, headlineSize, pill, ozzy }: Props): Promise<ImageResponse> {
  const font = await loadFraunces();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "linear-gradient(180deg,#0c0820 0%,#2b1556 62%,#b8513d 100%)", fontFamily: "Fraunces" }}>
        {STARS.map((s, i) => (
          <div key={i} style={{ position: "absolute", left: s.left, top: s.top, width: s.size, height: s.size, background: s.gold ? "#ffcf4a" : "#fff1d6", opacity: s.opacity }} />
        ))}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", alignItems: "flex-end" }}>
          {FAR.map((h, i) => <div key={i} style={{ width: CELL, height: (h + 2) * CELL, background: "#2a1238" }} />)}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", alignItems: "flex-end" }}>
          {NEAR.map((h, i) => <div key={i} style={{ width: CELL, height: h * CELL, background: "#140818" }} />)}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ozzy} width={360} height={360} alt="" style={{ position: "absolute", right: 70, bottom: 40, imageRendering: "pixelated" }} />
        <div style={{ position: "absolute", left: 72, top: 64, width: 700, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 36, fontWeight: 500, color: "#fff1d6" }}>
            <div style={{ width: 18, height: 18, background: "#ffcf4a", transform: "rotate(45deg)", marginRight: 16 }} />
            Komendly{label ? <span style={{ color: "#ffcf4a", marginLeft: 12 }}>{label}</span> : null}
          </div>
          <div style={{ marginTop: 36, fontSize: headlineSize, lineHeight: 1.04, fontWeight: 500, color: "#fff1d6", letterSpacing: -2 }}>{headline}</div>
          {pill ? (
            <div style={{ display: "flex", marginTop: 40 }}>
              <div style={{ background: "#ffcf4a", color: "#2a0f10", fontSize: 30, fontWeight: 500, padding: "14px 30px", borderRadius: 999 }}>{pill}</div>
            </div>
          ) : null}
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [{ name: "Fraunces", data: font, weight: 500, style: "normal" }] },
  );
}
