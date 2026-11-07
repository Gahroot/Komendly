import type { Glyph, Pose } from "./compose";
import type { OzzyState } from "./types";

export interface PoseInput {
  state: OzzyState;
  t: number; // seconds, renderer clock
  motionT: number; // seconds since last event
  phase: number; // per-instance breathing phase
  blink: boolean;
  ears: [number, number];
  look: { x: number; y: number } | null; // pointer offset in css px, null = none near
  still: boolean; // reduced motion
}

const HOP_T = 0.42;

/** Jump height in cells for the current motion (0 = on the ground). */
export function jumpHeight(motion: OzzyState["motion"], mt: number): number {
  const arc = (start: number, h: number) => {
    const u = (mt - start) / HOP_T;
    return u > 0 && u < 1 ? Math.sin(Math.PI * u) * h : 0;
  };
  if (motion === "hop") return arc(0, 4);
  if (motion === "summon") return arc(0.15, 6);
  if (motion === "celebrate") return arc(0, 3) + arc(0.5, 3);
  return 0;
}

function glyphFor(s: OzzyState): Glyph {
  if (s.form === "chill" || s.motion === "sleep") return "zzz";
  if (s.expression === "confused") return "question";
  if (s.expression === "surprised") return "bang";
  if (s.expression === "love") return "heart";
  return null;
}

function sparklesFor(s: OzzyState, t: number, mt: number): Pose["sparkles"] {
  const party = s.motion === "celebrate" || s.motion === "summon" || s.expression === "excited" || s.form === "joyful";
  if (!party) return [];
  const n = s.motion === "summon" && mt < 1.2 ? 6 : 4;
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    if (Math.sin(t * 5 + i * 1.7) < -0.2) continue;
    const a = (i / n) * Math.PI * 2 + t * 0.9;
    out.push({ x: 18 + Math.cos(a) * 17, y: 16 + Math.sin(a) * 13 });
  }
  return out;
}

/** Map state + time to a concrete pose. Pure. */
export function computePose(p: PoseInput): Pose {
  const { state: s, t, motionT: mt, still } = p;
  const sleeping = s.form === "chill";
  const period = sleeping ? 4.5 : 3.2;
  const br = still ? 0 : Math.sin((t / period) * Math.PI * 2 + p.phase);
  const brLag = still ? 0 : Math.sin(((t - 0.3) / period) * Math.PI * 2 + p.phase);
  let headDy = br > 0.35 ? 1 : 0;
  const hatDy = (brLag > 0.35 ? 1 : 0) - headDy;
  let headDx = 0;
  let eyeDx = 0;
  let eyeDy = 0;

  if (p.look && !sleeping) {
    eyeDx = Math.max(-1, Math.min(1, Math.round(p.look.x / 70)));
    eyeDy = p.look.y > 60 ? 1 : 0;
    headDx = Math.abs(p.look.x) > 130 ? Math.sign(p.look.x) : 0;
  }
  if (!still) {
    if (s.motion === "nod" && ((mt > 0.1 && mt < 0.3) || (mt > 0.5 && mt < 0.7))) headDy = 1;
    if (s.motion === "type") headDy = Math.floor(t * 5) % 2;
    if (s.motion === "think") headDx = -1;
  } else if (s.motion === "think") headDx = -1;

  let orbDx = 0;
  const orbDy = still ? 0 : Math.round(Math.sin(t * 2.2) * 1);
  if (s.motion === "scan" && !still) {
    orbDx = Math.round(Math.sin(t * 2.5) * 2);
    eyeDx = -1;
  }
  if (s.form === "explorer" && !p.look) eyeDx = -1;

  const happyTail = s.expression === "happy" || s.expression === "excited" || s.expression === "love";
  const tailAmp = sleeping ? 0 : happyTail ? 2 : 1;
  const tail = still ? 0 : Math.round(tailAmp * Math.sin(t * (happyTail ? 9 : 3)));
  const waving = s.motion === "wave" && (still || mt < 1.8);
  const wave = waving ? (still ? 0 : Math.floor(mt / 0.22) % 2) : null;
  const talk = !still && !!s.line && mt < 1.8 && Math.floor(mt / 0.11) % 3 !== 2;

  return {
    form: s.form,
    expression: s.expression,
    blink: !still && p.blink && !sleeping,
    talk,
    bodyDy: still ? 0 : -Math.round(jumpHeight(s.motion, mt)),
    headDx,
    headDy,
    eyeDx,
    eyeDy,
    hatDy,
    earL: still ? 0 : p.ears[0],
    earR: still ? 0 : p.ears[1],
    tail,
    cape: still ? 0 : t * (s.form === "ascended" ? 4 : 2.4),
    wave,
    orbDx,
    orbDy,
    glyph: glyphFor(s),
    glyphDy: still ? 0 : sleeping ? -((t * 1.2) % 3) : Math.round(Math.sin(t * 4)),
    sparkles: still ? [] : sparklesFor(s, t, mt),
    progress: s.progress,
  };
}
