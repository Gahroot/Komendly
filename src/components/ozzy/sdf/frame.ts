/** Build an SDF frame for the current state. */
import { type OzzyExpression, type OzzyForm, type OzzyState } from "../types";
import { formFace, formPose, formProps, SDF_FORM_LIST } from "./forms";
import { classicBody, faceParts, type Part } from "./model";
import { rasterize, type Frame } from "./raster";
import { BONES, type Bone, type BoneXf, type Pose } from "./rig";

type SdfForm = (typeof SDF_FORM_LIST)[number];
export const SDF_FORMS: ReadonlySet<OzzyForm> = new Set<OzzyForm>(SDF_FORM_LIST);

let BODY: Part[] | null = null;
const body = () => (BODY ??= classicBody());
/** Build props per form; a form whose builder throws just renders the plain body. */
function safeProps(f: SdfForm): Part[] {
  try {
    return [...body(), ...formProps(f)];
  } catch {
    return body();
  }
}
// Built lazily on first use: part bounds are costly, and most pages only ever show 1-2 forms.
const PROPS = new Map<SdfForm, Part[]>();
const props = (f: SdfForm) => PROPS.get(f) ?? (PROPS.set(f, safeProps(f)), PROPS.get(f) as Part[]);
const FACES = new Map<string, Part[]>();
function face(e: OzzyExpression, blink: boolean, grin: boolean): Part[] {
  const k = `${e}|${blink}|${grin}`;
  let v = FACES.get(k);
  if (!v) FACES.set(k, (v = grin ? faceParts("cool", blink, true) : faceParts(e, blink)));
  return v;
}

const isSdf = (f: OzzyForm): f is SdfForm => SDF_FORMS.has(f);

/** Sum offsets/rotations, multiply scales. */
function merge(a: Pose, b: Pose): Pose {
  const out: Pose = {};
  for (const k of BONES) {
    const x: Partial<BoneXf> | undefined = a[k as Bone];
    const y: Partial<BoneXf> | undefined = b[k as Bone];
    if (!x && !y) continue;
    out[k] = {
      dx: (x?.dx ?? 0) + (y?.dx ?? 0),
      dy: (x?.dy ?? 0) + (y?.dy ?? 0),
      rot: (x?.rot ?? 0) + (y?.rot ?? 0),
      sx: (x?.sx ?? 1) * (y?.sx ?? 1),
      sy: (x?.sy ?? 1) * (y?.sy ?? 1),
    };
  }
  return out;
}

export function sdfFrame(s: OzzyState, t: number, blink: boolean, still: boolean, size = 64): Frame {
  const form: SdfForm = isSdf(s.form) ? s.form : "classic";
  const w = still ? 0 : t;
  const idle: Pose = {
    body: { sy: 1 + Math.sin(w * 2.2) * 0.015 },
    head: { rot: Math.sin(w * 1.1) * 0.03, dy: Math.sin(w * 2.2) * 0.3 },
    earL: { rot: Math.sin(w * 1.7) * 0.05 },
    earR: { rot: -Math.sin(w * 1.7 + 1) * 0.05 },
    hatTip: { rot: Math.sin(w * 1.4) * 0.12 },
    tail: { rot: Math.sin(w * 3) * 0.12 },
  };
  const fe = formFace(form, s.expression);
  const parts = face(fe, blink, form === "adventurer" && fe === "cool");
  return rasterize([...props(form), ...parts], merge(idle, formPose(form, s, w, t)), size);
}
