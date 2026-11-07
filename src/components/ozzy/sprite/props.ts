import { layer } from "./layer";

/** Classic: short wand with a gold star, held at his left. */
export const WAND = layer(5, 19, [
  ".g.",
  "geg",
  ".g.",
  ".n.",
  ".n.",
  ".n.",
  ".n.",
  ".n.",
  ".n.",
]);

/** Explorer: floating glowing violet orb. */
export const ORB = layer(0, 16, [
  "...ooo...",
  ".oolllloo"[0] === "." ? ".oollmoo." : "",
  "olllmmmmo",
  "olemmmmmo",
  "olmmmmmvo",
  "ommmmmvvo",
  ".ommvvvo.",
  "..ooooo..",
]);

/** Creator: purple laptop, back facing viewer, gold K logo. */
export const LAPTOP = layer(12, 28, [
  "..oooooooooooo..",
  "..ovvvvgvgvvvo..",
  "..ovvvvggvvvvo..",
  "..ovvvvgvgvvvo..",
  "..oooooooooooo..",
  "oiiiiiiiiiiiiiio",
  ".oooooooooooooo.",
]);

/** Adventurer: cyan goggles strapped on the hat band. */
export const GOGGLES = layer(12, 8, [
  "..oooo....oooo..",
  ".occeco..occeco.",
  "oocccoooooocccoo",
  "..oooo....oooo..",
]);

/** Developer: holographic image panel floating at his left. */
export const PANEL = layer(0, 13, [
  "ccccccccc",
  "c.......c",
  "c....g..c",
  "c.......c",
  "c..m....c",
  "c.mmm.c.c",
  "cmmmmmccc",
  "ccccccccc",
]);
