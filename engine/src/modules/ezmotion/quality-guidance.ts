/**
 * Craft guidance shared by automatic motion ads and Ozzy Studio (for ad / promo / hype requests).
 * Written like the prompt that produced the reference set: hype, super fast cuts, energetic.
 */
export function motionQualityGuidance(): string {
  return [
    "Make it a hype video ad: super fast cuts and energetic.",
    "Cut every 0.6-1.2 s exactly on the music's beats (beats file), with a soft hit SFX on big transitions; make every beat a different layout (at least 6 in 15 s, never the same layout twice in a row), including one full-screen number or word slam.",
    "Something acts every 2-3 s: the brand's real product or screens in use (typed into, clicked, cards flying out, a number counting up) or a simple mascot/character reacting to the buyer's moment.",
    "Build one persistent designed world (backdrop, props, light) that runs through every scene and the end card, with at least 3 layers moving at different speeds and one stacked-card or 3D-ish beat; nothing frozen longer than 0.4 s.",
    "Open with a motion hit on the buyer's frustration in the first 0.5 s; kinetic type with per-word slams, mask reveals and highlight bars, short punchy lines readable muted; end on logo + CTA animated inside that world, not a flat card.",
  ].join(" ");
}
