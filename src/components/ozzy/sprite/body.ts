import { layer, mirror } from "./layer";

export const TAIL = layer(28, 22, [
  "......oo..",
  ".....owwo.",
  "....owwwwo",
  "....ofwwwo",
  "...offfwo.",
  "...offffo.",
  "..offffso.",
  ".offffso..",
  "offffso...",
  "offsso....",
  "osso......",
  "oo........",
]);

export const CAPE = layer(9, 24, [
  "...oooooooooooooooo...",
  "..ovvvvvvvvvvvvvvvvo..",
  "..ovvvvvvvvvvvvvvvvo..",
  ".olvvvvvvvvvvvvvvvvio.",
  ".olvvvvvvvvvvvvvvvvio.",
  "olvvvvvvvvvvvvvvvvvvio",
  "olvvvvvvvvvvvvvvvvvvio",
  "olvvvvvvvvvvvvvvvvvvio",
  "oivvvvvvvvvvvvvvvvvvio",
  "oiivvvvvvvvvvvvvvvviio",
  ".oooooooooooooooooooo.",
]);

/** Ascended: long flowing cape that flares out behind him. */
export const CAPE_LONG = layer(4, 23, [
  "........oooooooooooooooooo......",
  "......oovvvvvvvvvvvvvvvvvvoo....",
  ".....olvvvvvvvvvvvvvvvvvvvvio...",
  "....olvvvvvvvvvvvvvvvvvvvvvvio..",
  "...olvvvvvvvvvvvvvvvvvvvvvvvvio.",
  "...olvvvvvvvvvvvvvvvvvvvvvvvvio.",
  "..olvvvvvvvvvvvvvvvvvvvvvvvvvvio",
  "..olvvvvvvvvvvvvvvvvvvvvvvvvvvio",
  ".olvvvvvvvvvvvvvvvvvvvvvvvvvvvio",
  ".olvvvvvvvvvvvvvvvvvvvvvvvvvviio",
  "oivvvvvvvvvvvvvvvvvvvvvvvvvviio.",
  "oiivvvvmvvvvvvvvvvvvvvmvvviioo..",
  "ooooiioooiiiiiiiiiiiiooiiioo....",
  "....oo...oooooooooooo..oo.......",
]);

export const COLLAR = layer(14, 24, [
  "ovvvvggvvvvo",
  ".oovgeegvoo.",
  "....ogo.....",
]);

export const BODY = layer(12, 24, [
  "..oooooooooooo..",
  ".offfwwwwwwfffo.",
  "offffwwwwwwffffo",
  "offffwwwwwwffffo",
  "osfffwwwwwwfffso",
  "osffffwwwwffffso",
  "ossfffwwwwfffsso",
  ".ossffffffffsso.",
  ".osssffffffssso.",
  ".offo.oooo.offo.",
  ".owwo......owwo.",
  ".oooo......oooo.",
]);

export const HEAD = layer(10, 12, [
  "...oooooooooooooo...",
  "..offffffffffffffo..",
  ".offffffffffffffffo.",
  ".offffffffffffffffo.",
  "offffffffffffffffffo",
  "offffffffffffffffffo",
  "offffffffffffffffffo",
  "ofsffwwwwwwwwwwffsfo",
  "osffwwwwwnnwwwwwffso",
  "oswfwwwwwwwwwwwwfwso",
  ".owwfwwwwwwwwwwfwwo.",
  "..owwwwwwwwwwwwwwo..",
  "...oooooooooooooo...",
]);

export const EAR_L = layer(7, 4, [
  "oo....",
  "ofo...",
  "ofwo..",
  "ofwfo.",
  "ofwwfo",
  "ofwwfo",
  "offwfo",
  "offffo",
  "offffo",
]);
export const EAR_R = mirror(EAR_L);

/** Waving paw raised beside the head. */
export const PAW_WAVE = layer(29, 18, [
  ".oo..",
  "owwo.",
  "owwfo",
  ".offo",
  ".offo",
  "..ofo",
]);
