import type { OzzyExpression } from "../types";
import { layer, type Layer } from "./layer";

const EX = 13;
const EY = 15;
const MX = 16;
const MY = 21;

const BLANK = "..............";

export const EYES: Record<OzzyExpression, Layer> = {
  neutral: layer(EX, EY, [".ooo......ooo.", ".eeo......eeo.", ".eoo......eoo.", ".ooo......ooo."]),
  happy: layer(EX, EY, [BLANK, "..o........o..", ".o.o......o.o.", "o...o....o...o"]),
  excited: layer(EX, EY, [".ooo......ooo.", ".ego......ego.", ".ggo......ggo.", ".ooo......ooo."]),
  surprised: layer(EX, EY - 1, [".ooo......ooo.", "oeeoo....oeeoo", "oeooo....oeooo", "ooooo....ooooo", ".ooo......ooo."]),
  cool: layer(EX - 1, EY, ["oooooooooooooooo", "occbbbo..occbbbo", "obbbbbo..obbbbbo", ".obbbo....obbbo."]),
  confused: layer(EX, EY, [".ooo..........", ".eeo..........", ".eoo......ooo.", ".ooo.........."]),
  love: layer(EX, EY, ["pp.pp....pp.pp", "ppppp....ppppp", ".ppp......ppp.", "..p........p.."]),
  sleepy: layer(EX, EY, [BLANK, ".sss......sss.", ".ooo......ooo.", BLANK]),
  focused: layer(EX, EY, [BLANK, ".sss......sss.", ".eoo......eoo.", ".ooo......ooo."]),
};

export const EYES_BLINK = layer(EX, EY, [BLANK, BLANK, ".ooo......ooo.", BLANK]);

/** Cheeks drawn for warm expressions. */
export const BLUSH = layer(12, 19, ["pp............pp"]);

export const MOUTHS: Record<OzzyExpression, Layer> = {
  neutral: layer(MX, MY, ["...oo...", ".o.oo.o.", "..o..o.."]),
  happy: layer(MX, MY, ["...oo...", ".oooooo.", "..oppo.."]),
  excited: layer(MX, MY, [".oooooo.", ".oppppo.", "..oooo.."]),
  surprised: layer(MX, MY, ["...oo...", "..oooo..", "..oooo.."]),
  cool: layer(MX, MY, ["...oo...", "....o.o.", ".....o.."]),
  confused: layer(MX, MY, ["...oo...", "........", ".o.o.o.."]),
  love: layer(MX, MY, ["...oo...", ".oooooo.", "...pp..."]),
  sleepy: layer(MX, MY, ["...oo...", "...oo...", "........"]),
  focused: layer(MX, MY, ["...oo...", "..oooo..", "........"]),
};

/** Open mouth used for talking frames. */
export const MOUTH_TALK = layer(MX, MY, ["...oo...", "..oooo..", "..oppo.."]);

export const WARM: ReadonlySet<OzzyExpression> = new Set(["happy", "excited", "love"]);
