import { moonCells, ridgeHeights, ridgePath, seeded } from "./pixel-art";

const STARS = (() => {
  const r = seeded(7);
  return Array.from({ length: 70 }, (_, i) => ({
    left: `${(r() * 100).toFixed(2)}%`,
    top: `${(r() * 100).toFixed(2)}%`,
    size: r() > 0.85 ? 3 : 2,
    opacity: (0.35 + r() * 0.6).toFixed(2),
    dur: `${(3 + r() * 6).toFixed(1)}s`,
    delay: `${(-r() * 6).toFixed(1)}s`,
    gold: i % 9 === 0,
  }));
})();

const FIREFLIES = (() => {
  const r = seeded(21);
  return Array.from({ length: 9 }, () => ({
    left: `${(5 + r() * 90).toFixed(1)}%`,
    bottom: `${(4 + r() * 16).toFixed(1)}%`,
    dx: `${Math.round((r() - 0.5) * 80)}px`,
    dy: `${Math.round(-20 - r() * 50)}px`,
    dur: `${(7 + r() * 6).toFixed(1)}s`,
    delay: `${(-r() * 12).toFixed(1)}s`,
  }));
})();

const CELL = 8;
const FAR = ridgeHeights(200, 3, 9, 5);
const NEAR = ridgeHeights(200, 11, 6, 4);
const MOON = moonCells(16);
// A small constellation (Ozzy's star): gold star points + linking path
const CONST_PTS: [number, number][] = [[10, 70], [48, 40], [86, 58], [122, 20], [160, 46], [196, 30], [236, 64]];

/** Layered dusk sky: gradient, twinkling pixel stars, pixel moon, constellation, stepped outback ridges, fireflies. Pure CSS/SVG. */
export function StudioSky() {
  const farH = 16 * CELL;
  const nearH = 12 * CELL;
  return (
    <div className="studio-sky" aria-hidden>
      <div className="studio-sky__grad" />
      <div className="studio-sky__stars">
        {STARS.map((s, i) => (
          <i
            key={i}
            className={s.gold ? "gold" : undefined}
            style={{ left: s.left, top: s.top, ["--s" as string]: `${s.size}px`, ["--o" as string]: s.opacity, ["--d" as string]: s.dur, ["--delay" as string]: s.delay }}
          />
        ))}
      </div>
      <svg className="studio-constellation" viewBox="0 0 250 90">
        <path d={`M${CONST_PTS.map(([x, y]) => `${x} ${y}`).join(" L")}`} />
        {CONST_PTS.map(([x, y], i) => <rect key={i} x={x - 1.5} y={y - 1.5} width={3} height={3} />)}
      </svg>
      <svg className="studio-sky__moon" viewBox="0 0 16 16" shapeRendering="crispEdges">
        {MOON.map((m) => <rect key={`${m.x}-${m.y}`} x={m.x} y={m.y} width={1} height={1} fill={m.c} />)}
      </svg>
      <svg className="studio-sky__ridge studio-sky__ridge--far" viewBox={`0 0 ${FAR.length * CELL} ${farH}`} preserveAspectRatio="none">
        <path d={ridgePath(FAR, CELL, farH)} fill="#2a1238" />
      </svg>
      <svg className="studio-sky__ridge" viewBox={`0 0 ${NEAR.length * CELL} ${nearH}`} preserveAspectRatio="none">
        <path d={ridgePath(NEAR, CELL, nearH)} fill="#140818" />
      </svg>
      <div className="studio-sky__fireflies">
        {FIREFLIES.map((f, i) => (
          <i key={i} style={{ left: f.left, bottom: f.bottom, ["--dx" as string]: f.dx, ["--dy" as string]: f.dy, ["--d" as string]: f.dur, ["--delay" as string]: f.delay }} />
        ))}
      </div>
    </div>
  );
}
