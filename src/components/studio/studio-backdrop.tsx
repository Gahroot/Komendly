import { seeded } from "./pixel-art";

const STARS = (() => {
  const r = seeded(42);
  return Array.from({ length: 40 }, () => ({ left: `${(r() * 100).toFixed(1)}%`, top: `${(r() * 60).toFixed(1)}%`, o: (0.25 + r() * 0.5).toFixed(2), d: `${(3 + r() * 6).toFixed(1)}s`, delay: `${(-r() * 6).toFixed(1)}s` }));
})();

/** Quiet fixed night sky for app pages: deep gradient, a few stars, warm horizon glow. */
export function StudioBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#0b0720_0%,#150c34_45%,#1f1040_75%,#2a1236_100%)]" />
      <div className="absolute -bottom-40 left-1/2 h-80 w-[110%] -translate-x-1/2 rounded-[50%] bg-[oklch(0.62_0.17_45/0.22)] blur-3xl" />
      <div className="studio-sky__stars">
        {STARS.map((s, i) => (
          <i key={i} style={{ left: s.left, top: s.top, ["--o" as string]: s.o, ["--d" as string]: s.d, ["--delay" as string]: s.delay }} />
        ))}
      </div>
    </div>
  );
}
