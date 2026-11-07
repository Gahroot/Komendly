import Image from "next/image";

// Real output drifting in the night sky beside the hero (desktop only; purely decorative).
const CARDS = [
  { src: "/ads/samples/tidybooks-ad-0-4x5.jpg", w: 4, h: 5, style: { left: "3%", top: "24%", width: 190 }, depth: 18, rot: -7, delay: "0s" },
  { src: "/ads/samples/nightshift-ad-0-9x16.jpg", w: 9, h: 16, style: { left: "11%", top: "52%", width: 150 }, depth: 30, rot: 5, delay: "-2s" },
  { src: "/ads/samples/plausible-ad-1-4x5.jpg", w: 4, h: 5, style: { right: "4%", top: "36%", width: 200 }, depth: 22, rot: 6, delay: "-1s" },
  { src: "/ads/samples/tidybooks-ad-1-1x1.jpg", w: 1, h: 1, style: { right: "13%", top: "64%", width: 150 }, depth: 34, rot: -5, delay: "-3s" },
];

export function StudioFloatingAds() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] hidden xl:block">
      {CARDS.map((c) => (
        <div
          key={c.src}
          className="studio-float absolute"
          style={{ ...c.style, ["--depth" as string]: c.depth, ["--rot" as string]: `${c.rot}deg`, ["--delay" as string]: c.delay }}
        >
          <div className="studio-float__card pixel-frame p-1.5">
            <Image src={c.src} alt="" width={c.w * 120} height={c.h * 120} sizes="200px" className="h-auto w-full" priority={false} />
          </div>
        </div>
      ))}
    </div>
  );
}
