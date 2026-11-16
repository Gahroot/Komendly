# Third-party content in the motion library

The library (README.md, build-sheet.md, looks/, pieces/, kit/moves.js, sheets/,
library.json) and `../bin/library.mjs` are vendored from the user's own
MIT-licensed motion package (vendored 2026-11-14), adapted for Ozzy Studio:
project-relative paths, fonts from ./kit/fonts, a `brand` look, the kit global
renamed to `window.MotionKit`, and the one Three.js piece (clay-drop-3d) left out.

| Component | Source | License |
|---|---|---|
| Pieces marked `"license": "MIT"` in meta.json (animated-beam, animated-list, dock-magnify, flickering-grid, orbiting-circles, retro-grid) | Magic UI, https://github.com/magicuidesign/magicui (upstream file URL in each meta.json) | MIT (`LICENSE` beside each piece; `library.mjs add` copies it into the project) |
| Fonts used by looks (`kit/fonts/<family>/`) | Google Fonts | SIL OFL 1.1 (`OFL.txt` beside each family) |
| GSAP (loaded by pieces from jsDelivr, pinned 3.14.2) | https://gsap.com | GSAP standard license |
