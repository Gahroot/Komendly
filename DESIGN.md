# Komendly design system

Two layers:
1. **Studio — "Moonlit Outback Atelier"** (2026-11): the Ads homepage (`/`), every `/ads/*` page, and the whole testimonials product
   (`/testimonials`, `/pricing`, `/register`, `/login`, `/checkout/*`, `/dashboard/*`). Always-dusk night sky, pixel moon,
   stepped outback ridges, gold stars, and Ozzy the dingo wizard. This is the brand.
2. **Midnight Glass** (below): admin only (`/admin`). Unchanged.

## Studio ("Moonlit Outback Atelier")
- Scope: `.studio` wrapper (`StudioRoot` in `src/components/studio/studio-spell.tsx`) sets its own tokens in `src/components/studio/studio.css`;
  shadcn components inside inherit them. `/ads/*` gets it from `src/app/ads/layout.tsx`; testimonials marketing/auth/checkout layouts wrap
  pages in `TestiStudio` (`src/components/testimonials/testi-studio.tsx`) and `src/app/dashboard/layout.tsx` uses `StudioRoot` directly.
  Dark only (no theme toggle in the studio).
- Testimonials parts: `src/components/testimonials/*` (offer card, `OzzyPerch`, review draft form) and `create/*` (steps, presenter grid,
  out-of-minutes gate). The create flow (`/dashboard/create-fal` → `style` → `generate`) shows stages from the real status API
  (`stageFromStatus` in `src/lib/create-flow.ts`); `OzzyPerch` moods follow those real stages only.
- Palette: night ink `#0c0820`, violet `#7b3cf0`/`#a970ff`, ember horizon `oklch(0.62 0.17 45)`, gold `#ffcf4a` (primary actions, emphasis),
  cream text `oklch(0.96 0.03 75)`, cyan `#5ee6ff` (magic/tech accents only). Purple is allowed here: it is Ozzy's hat and cape.
- Type: Fraunces (display, `font-display` / `var(--font-fraunces)`) for headlines and Ozzy's voice; Geist for UI; Geist Mono for kickers.
  Emphasis = solid gold or italic Fraunces. Still **no gradient text**.
- Materials: night glass cards; gold CTA with a pressed bottom edge (`.spellbar__cta`); stepped pixel corners (`.pixel-frame`);
  real pixels are crisp (`shape-rendering: crispEdges`, `image-rendering: pixelated`).
- Motion tokens: `--ease-out (.22,1,.36,1)`, `--ease-expo (.16,1,.3,1)`, `--ease-pop (.3,1.6,.6,1)`. Content resolves from blur once
  (`.studio-rise`); pixel loops use `steps()`. Ambient motion is slow (stars, fireflies, floating ads, pointer parallax on fine pointers).
  `prefers-reduced-motion`: ambient loops off, parallax off, Ozzy holds still expressive poses.
- The "spell": the URL field drives page atmosphere via `data-spell` (idle/typing/valid/invalid/cast): moon glows while typing, the
  constellation draws itself on a valid URL, the sky brightens on submit.
- Progress is honest: stages come from real run status (`src/lib/ads/run-stage.ts`), counts from real ads. No timers, no fake percentages.

## Ozzy (mascot)
- One character, 8 forms (classic, joyful, explorer, creator, adventurer, developer, chill, ascended) × 9 expressions. Source of truth:
  the approved concept sheet. Drawn live by a procedural SDF pixel-art rasterizer (`src/components/ozzy/sdf/`), 64×64 cells, lit + outlined.
- Driven only by real events: `ozzy.emit({ type: ... })` (`src/components/ozzy/store.ts`; mapping in `machine.ts`). Never invent progress.
- Use `<OzzyLazy size perch interactive? speech? pose? />`. Decorative by default (aria-hidden, no pointer events);
  `interactive` = real button (poke). Never place him over inputs, buttons or text; perch him on top edges. Wrapped in an error boundary.
- Lines: short, warm, plain; one at a time, beside him (not over headlines). He's Australian ("G'day") but never gimmicky.
- Lab: `/ozzy-lab` (noindex) shows every form, expression and event.

---

# Midnight Glass (admin only)

Dark-first, calm, atmospheric. Deep ink-blue canvas, two soft ambient glows, translucent glass surfaces with a thin lit rim, one periwinkle accent (+ teal secondary). Inspired by liquid-glass desktop UIs; Komendly keeps its own logo.

## Light and dark
- Both themes are first-class. `:root` holds the **light** set ("daylight glass": cool off-white canvas, faint periwinkle/teal glows, frosted white glass, crisp hairlines); `.dark` holds the **midnight** set. Same token names in both.
- Switching: `next-themes` (`attribute="class"`, `defaultTheme="system"`) in `src/components/providers.tsx`; `<ThemeToggle />` (`src/components/theme-toggle.tsx`, light/dark/system) lives in the site header, app sidebars/mobile headers and the ads nav.
- Theme-dependent material values are variables, never literals: `--glass-rim`, `--glass-shadow`, `--glass-float-shadow`, `--glass-subtle-bg`, `--field`, `--brand-from/--brand-to`, `--glow-1..3`. Add a new one to **both** blocks.
- Rules: never `text-white`/`bg-black`/`border-white/10`/`zinc-*` on UI chrome — use tokens. White text on black scrims is allowed only on top of photos/video. Shadows come from the shadow vars (black shadows look dirty on light). Use `dark:` only for small exceptions (e.g. `dark:prose-invert`). Check every new screen in both themes.
- Light primary is a deeper periwinkle (`oklch(0.51 0.17 268)`, white text, ≥5:1); dark primary is lighter with dark text.

## Semantic tokens (use only these in feature code)
| Token | Use |
|---|---|
| `background` / `foreground` | page canvas / body text |
| `card` (translucent) | glass panels; `popover` = floating menus |
| `primary` (periwinkle) / `primary-foreground` | the one main action, active nav, links, focus |
| `secondary`, `accent`, `muted` (white @ 5–9%) | quiet buttons, hover fills, wells |
| `muted-foreground` | secondary text (AA on canvas) |
| `border` / `input` / `ring` | hairlines, fields, focus ring |
| `destructive`, `success`, `warning` | status |
| `chart-1..5` | periwinkle, teal, green, amber, coral |
| `sidebar-*` | app shells |
Extra vars: `--brand-glow`, `--brand-teal`.

## Utilities
- `.field` – translucent input well (theme-aware).
- `.glass` – default panel (card bg + rim + shadow + blur 14px; 8px on mobile).
- `.glass-subtle` – nested wells, no blur.  `.glass-float` – menus, dialogs, sticky header.
- `.bg-brand` – the single brand fill for hero CTAs / key icons (periwinkle → deeper periwinkle, same hue).
- `.text-primary` – headline emphasis only (foreground → primary → teal).
- `.glow-primary` – highlight a recommended plan / selected card.

## Elevation
0 canvas → 1 `.glass-subtle` → 2 `.glass`/Card → 3 `.glass-float` (popover, dialog, sheet). Never stack more than 2 blurred layers.

## Radius
`--radius` 14px. Buttons/inputs `rounded-lg`, cards `rounded-2xl`, dialogs `rounded-3xl`, pills/badges `rounded-full`.

## Typography (Geist / Geist Mono)
Display `text-5xl–7xl font-semibold tracking-tight`; H1 `text-3xl font-semibold tracking-tight`; H2 `text-xl font-semibold`; body `text-sm/base`; caption `text-xs text-muted-foreground`; numbers `tabular-nums`; code `font-mono`. Headings get -0.02em tracking and balanced wrap globally.

## Spacing
4px grid. Page: `mx-auto max-w-6xl px-4 sm:px-6 py-8`. Card padding `p-6`; stack gaps `gap-4`/`gap-6`; section gap `py-20+` on marketing.

## Motion
150–250ms, `ease-out` (`--ease-out`). Animate opacity/transform only. Hover: subtle bg/border change, ≤2px lift. `prefers-reduced-motion` disables animation globally (globals.css).

## Recipes
- **Page**: header row (H1 + muted description left, primary action right), then content grid.
- **Card**: `<Card>` (already glass). Title `text-base font-semibold`, description muted.
- **Form**: `Label` above `Input`; 1 column; help text `text-xs text-muted-foreground`; errors `text-destructive`; one primary button, others `variant="outline"`/`ghost`.
- **Empty state**: `.glass` or dashed `border` box, centered lucide icon in `size-12 rounded-2xl bg-primary/10 text-primary`, title, one sentence, one action.
- **Data table**: `<Table>` inside a Card with `p-0`; header `text-xs uppercase tracking-wide text-muted-foreground`; row hover `bg-accent/50`; numbers right-aligned tabular.

## Do / Don't
- Do use semantic tokens (`bg-primary`, `text-muted-foreground`, `border-border`).
- **(Midnight Glass only; the Studio uses Ozzy's violet)** Don't use pink/purple/fuchsia/violet gradients or classes. Don't hard-code colours (hex, `purple-500`, etc.) in feature code.** Status colours via `destructive`/`success`/`warning` tokens (`text-[var(--success)]` is fine) or emerald/amber/red only for semantic status.
- Don't put glass on glass on glass; don't animate blur.

## Accessibility
Text ≥ AA (4.5:1; `muted-foreground` on canvas ≈ 7:1; `primary-foreground` on primary ≈ 8:1). All interactive elements keep `focus-visible:ring-[3px] ring-ring`. Never convey state by colour alone. Respect reduced motion. Touch targets ≥ 40px on mobile.


## No gradient text
Never use gradient-filled text (`bg-clip-text` / transparent text over a gradient). It reads as generic AI-template styling.
Emphasise a word with solid `text-primary`, weight, or plain contrast instead. Gradients are reserved for subtle background atmosphere only.
