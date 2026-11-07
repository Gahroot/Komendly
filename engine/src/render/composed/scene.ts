// Per-ad scene direction so a brand's ten ads differ in setting, light, distance and composition.
// Axes rotate at different strides, so no two ads in a run share the same combination.
// Device/screenshot scenes only when the brand has real screenshots (software).

const SETTINGS = [
  "the buyer's own moment from the angle, staged in their real place (e.g. bedroom, kitchen, desk, yard)",
  "if the product is a small item you can hold: one hand holding it (hand only, no face, no body); otherwise (a service, a place, a building, software): a calm close detail of the buyer's real place, with no hands or people",
  "extreme macro of the real product's label or texture (for a service or place: a crisp close-up of one telling real detail from the site's photos)",
  "overhead flat-lay on a natural surface (linen, wood, stone) with two simple props",
  "pure flat brand-colour field with the product alone",
  "a quiet detail of the buyer's moment (a glowing phone, a clock, a doorway) with the product small",
  "the product isolated as a clean cut-out over bold typography",
] as const;
const LIGHT = ["soft morning daylight", "deep night with one warm practical light", "bright even studio light", "cool blue dusk", "hard sun with crisp shadows"] as const;
const CAMERA = ["wide establishing shot", "medium shot", "close-up", "top-down"] as const;
const LAYOUT = ["headline top, image below", "split: headline half, image half", "image full-bleed, headline over calm area", "headline large, image small in a corner"] as const;
const DEVICE = "the real screenshot inside a clean modern device on a plain backdrop";

function pick<T>(list: readonly T[], i: number): T {
  const v = list[((i % list.length) + list.length) % list.length];
  if (v === undefined) throw new Error("empty list");
  return v;
}

/** shift > 0 asks for an alternative scene (used by the diversity check). */
export function sceneFor(index: number, hasScreens = false, shift = 0): string {
  const settings: readonly string[] = hasScreens ? [DEVICE, ...SETTINGS] : SETTINGS;
  const i = index + shift * 3;
  return [pick(settings, i), pick(LIGHT, i * 2 + 1), pick(CAMERA, i + Math.floor(i / 4)), pick(LAYOUT, i * 3 + 2)].join("; ");
}
