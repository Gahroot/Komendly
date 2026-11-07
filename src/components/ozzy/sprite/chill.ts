import { layer } from "./layer";

/** Chill: curled up asleep, head on the left, tail wrapped round the front. */
export const CURL = layer(5, 26, [
  "...oooooooo...................",
  "..offffffffo..oooooooooooooo..",
  ".offffffffffooffffffffffffffo.",
  ".offffffffffffffffffffffffsfo.",
  "offfffffffffffffffffffffffsfo.",
  "offffwwwwfffffffffffffffffssfo",
  "owwwwwwwwwwfffffffffffffssffo.",
  "ownwwwwwwwwoooooooooooooooofo.",
  ".owwwwwwwwowwwwfffffffffffso..",
  "..oooooooooooooooooooooooooo..",
]);
export const CURL_EYE = layer(8, 30, ["ooo"]);
export const CURL_EARS = layer(6, 23, ["o....o...", "of...of..", "ofwo.ofwo", "offo.offo"]);
/** Hat offset used when curled. */
export const CHILL_HAT_DX = 7;
export const CHILL_HAT_DY = 15;
