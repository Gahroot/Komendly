# EZMotion module

Renders the animated ad, a 10–14 s H.264 MP4 per ratio (9:16 1080x1920, 1:1 1080x1080,
4:5 1080x1350), plus a poster JPEG. It is built from the site's own logo, screenshots,
brand colors and fonts.

How it works: one LLM call picks a scene plan (`plan.ts`; any failure falls back to a
deterministic plan). `composition.ts` turns that plan into a HyperFrames composition with
one paused GSAP timeline. Then it renders with `hyperframes render`, converts to yuv420p
with faststart, keeps the file under 30 MB, and runs the EZ Motion `flash-check.mjs`
screen. If the flash check fails, the render throws.

## Enabling

Behind `AdsFeatureFlag` `'ezmotion'`. The engine dynamic-imports
`src/modules/ezmotion/index.ts` and should first call `isMotionAvailable()`, which checks
Node ≥ 22, the `hyperframes` + `gsap` packages, ffmpeg/ffprobe and Chrome. If it returns
`{ ok: false, reason }`, skip the motion ad and report the reason.

## Dockerfile requirements (Debian bookworm, `node:22-bookworm-slim`)

- **Node 22+**.
- npm deps (already in `engine/package.json`): `hyperframes@0.8.82` (pinned, same as
  EZ Coder's Motion), `gsap@3.15.1`, `sharp`.
- **ffmpeg + ffprobe**: `apt-get install -y ffmpeg`, or point `HYPERFRAMES_FFMPEG_PATH`
  (ffprobe is looked up beside it, or set `HYPERFRAMES_FFPROBE_PATH`).
- **Chrome headless shell** (HyperFrames' pinned build). At image build time, as the user
  that runs the engine:
  `cd engine && npx hyperframes browser ensure`
  This installs into `$HOME/.cache/hyperframes/chrome/` (e.g.
  `/root/.cache/hyperframes/chrome/chrome-headless-shell/...`). Alternatively, set
  `PRODUCER_HEADLESS_SHELL_PATH=/abs/path/chrome-headless-shell` (or
  `HYPERFRAMES_BROWSER_PATH` for a full Chromium). Use Chromium 130+ if you supply your own.
- Chrome shared libs and fonts:
  ```
  apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libdbus-1-3 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxext6 libx11-6 \
    libxcb1 libgbm1 libasound2 libpango-1.0-0 libcairo2 libexpat1 \
    fontconfig libfontconfig1 fonts-liberation fonts-noto-core fonts-noto-color-emoji
  ```
  Brand fonts are fetched per job (sourceUrl, then Google Fonts) into the job folder. The
  fallback is the vendored OFL fonts in `vendor/fonts` (Mona Sans). Nothing is fetched at
  render time.
- Resources: about 1 GB RAM per concurrent render (HyperFrames workers spawn Chrome,
  ~256 MB each). Run at most 1–2 motion renders at a time on a small Railway box.
- Ship `src/modules/ezmotion/vendor/` in the image (flash check, fonts, licences).

## Env

| Var | Default | Use |
|---|---|---|
| `HYPERFRAMES_FFMPEG_PATH` / `HYPERFRAMES_FFPROBE_PATH` | PATH lookup | ffmpeg binaries |
| `PRODUCER_HEADLESS_SHELL_PATH` / `HYPERFRAMES_BROWSER_PATH` | `~/.cache/hyperframes/chrome` | Chrome |
| `EZMOTION_MUSIC_PATH` | unset (silent) | optional licensed track (mp3), mixed in |
| `EZMOTION_MUSIC_VOLUME` | `0.18` | music level |

Telemetry and update checks are disabled automatically (`HYPERFRAMES_NO_TELEMETRY=1`,
`HYPERFRAMES_NO_UPDATE_CHECK=1`). The bundled EZ Motion music is not shipped because its
licence terms are unverified.

## Testing

- Unit: `cd engine && npx vitest run src/modules/ezmotion` (stub provider, no Chrome needed).
- Preview: `cd engine && npx tsx scripts/motion-preview.ts [--llm] [--ratios 9:16,1:1] [--only plausible|cal]`
  writes to `~/.ezcoder/goals/website2ads/motion-preview/`. `--llm` uses
  `createProvider("codex")`, which needs `CODEX_AUTH_FILE`.

## Licences

`vendor/HYPERFRAMES-LICENSE` (Apache-2.0), `vendor/THIRD-PARTY.md`, OFL.txt in each font folder.
