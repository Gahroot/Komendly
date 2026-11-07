/** Bone hierarchy + affine transforms. Parts live in model space; bones move them. */
export const BONES = ["root", "body", "head", "earL", "earR", "hat", "hatTip", "tail", "pawL", "pawR", "cape", "eyes", "fx", "orb", "ring1", "ring2", "panel", "wing"] as const;
export type Bone = (typeof BONES)[number];

interface BoneDef {
  parent: Bone | null;
  pivot: readonly [number, number];
}

export const RIG: Record<Bone, BoneDef> = {
  root: { parent: null, pivot: [32, 60] },
  body: { parent: "root", pivot: [32, 56] },
  head: { parent: "body", pivot: [32, 40] },
  earL: { parent: "head", pivot: [20, 22] },
  earR: { parent: "head", pivot: [44, 22] },
  hat: { parent: "head", pivot: [32, 21] },
  hatTip: { parent: "hat", pivot: [36, 6] },
  tail: { parent: "body", pivot: [42, 54] },
  pawL: { parent: "body", pivot: [26.5, 45] },
  pawR: { parent: "body", pivot: [37.5, 45] },
  cape: { parent: "body", pivot: [32, 40] },
  eyes: { parent: "head", pivot: [32, 29] },
  fx: { parent: "root", pivot: [54, 9] },
  orb: { parent: "root", pivot: [54, 27] },
  ring1: { parent: "orb", pivot: [54, 27] },
  ring2: { parent: "orb", pivot: [54, 27] },
  panel: { parent: "root", pivot: [9, 26] },
  wing: { parent: "cape", pivot: [20, 40] },
};

export interface BoneXf {
  dx: number;
  dy: number;
  rot: number;
  sx: number;
  sy: number;
}

export type Pose = Partial<Record<Bone, Partial<BoneXf>>>;

/** 2x3 affine [a,b,c,d,e,f]: x' = a x + c y + e ; y' = b x + d y + f */
export type Mat = [number, number, number, number, number, number];

const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

function local(b: Bone, x: Partial<BoneXf> | undefined): Mat {
  const [px, py] = RIG[b].pivot;
  const r = x?.rot ?? 0;
  const sx = x?.sx ?? 1;
  const sy = x?.sy ?? 1;
  const c = Math.cos(r);
  const s = Math.sin(r);
  // translate(pivot+d) * rotate * scale * translate(-pivot)
  const a = c * sx;
  const bb = s * sx;
  const cc = -s * sy;
  const d = c * sy;
  const tx = px + (x?.dx ?? 0);
  const ty = py + (x?.dy ?? 0);
  return [a, bb, cc, d, tx - a * px - cc * py, ty - bb * px - d * py];
}

function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  const ia = m[3] / det;
  const ib = -m[1] / det;
  const ic = -m[2] / det;
  const id = m[0] / det;
  return [ia, ib, ic, id, -(ia * m[4] + ic * m[5]), -(ib * m[4] + id * m[5])];
}

/** World->model inverse matrix per bone, used to sample part SDFs. */
export function solveRig(pose: Pose): Record<Bone, Mat> {
  const world = {} as Record<Bone, Mat>;
  for (const b of BONES) {
    const p = RIG[b].parent;
    const l = local(b, pose[b]);
    world[b] = p ? mul(world[p], l) : l;
  }
  const inv = {} as Record<Bone, Mat>;
  for (const b of BONES) inv[b] = invert(world[b]);
  return inv;
}
