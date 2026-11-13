# Komendly ads engine. Build context = repo root:
#   docker build -f engine/Dockerfile -t komendly-engine .
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PORT=4100 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    HYPERFRAMES_NO_TELEMETRY=1 \
    HYPERFRAMES_NO_UPDATE_CHECK=1 \
    DO_NOT_TRACK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates openssl ffmpeg fontconfig tini \
      fonts-liberation fonts-noto-core fonts-noto-color-emoji fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app && useradd --system --gid app --create-home --home-dir /home/app app
# yt-dlp (standalone x86_64 binary, no Python needed) for Studio "Remix any ad" links (studio_ingest). Latest release
# on purpose: platforms change their players often. Found via YTDLP_PATH or PATH.
ADD https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux /usr/local/bin/yt-dlp
RUN chmod 0755 /usr/local/bin/yt-dlp

WORKDIR /app
# The engine imports ../src/lib/ads/contracts.ts and generates Prisma from ../prisma/schema.prisma.
COPY prisma/schema.prisma prisma/schema.prisma
COPY src/lib/ads/contracts.ts src/lib/ads/contracts.ts
COPY src/lib/ads/meta/core/ src/lib/ads/meta/core/
COPY src/lib/ads/trial-confirm.ts src/lib/ads/trial-confirm.ts
COPY src/lib/testimonial/contracts.ts src/lib/testimonial/contracts.ts
COPY src/lib/studio/contracts.ts src/lib/studio/contracts.ts
COPY src/lib/hub/money-model.ts src/lib/hub/money-model.ts
COPY src/lib/ads/billing-config.ts src/lib/ads/billing-config.ts
COPY src/lib/ads/weekly-drop.ts src/lib/ads/weekly-drop.ts
COPY src/lib/ads/autopilot.ts src/lib/ads/autopilot.ts
COPY src/lib/ads/lifecycle/ src/lib/ads/lifecycle/
COPY src/lib/ads/bonus-access.ts src/lib/ads/bonus-access.ts
COPY src/lib/ads/bonuses/contracts.ts src/lib/ads/bonuses/contracts.ts
COPY src/lib/ads/referral-code.ts src/lib/ads/referral-code.ts
COPY src/lib/ads/coach/contracts.ts src/lib/ads/coach/contracts.ts
COPY src/lib/ads/coach/table.ts src/lib/ads/coach/table.ts
COPY src/lib/ads/coach/assess.ts src/lib/ads/coach/assess.ts
COPY src/lib/ads/coach/match.ts src/lib/ads/coach/match.ts
COPY engine/package.json engine/package-lock.json engine/
COPY engine/scripts/prisma-generate.mjs engine/scripts/prisma-generate.mjs

WORKDIR /app/engine
# devDependencies kept: the engine runs TS via tsx and the container test uses vitest.
RUN npm ci --include=dev && npm cache clean --force
# Playwright Chromium (same version as engine's playwright) + its system deps.
RUN npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*
# EZ Motion agent (EZ Coder's Motion mode) for the animated ad; pinned. Its bundle brings HyperFrames 0.8.82.
RUN npm install -g @prestyj/cli@5.32.2 && npm cache clean --force
ENV EZMOTION_CLI_DIST=/usr/local/lib/node_modules/@prestyj/cli/dist

COPY engine/ ./
# Shared files under /app/src (contracts, meta core) resolve packages from the engine's node_modules.
RUN ln -s /app/engine/node_modules /app/node_modules
RUN node scripts/prisma-generate.mjs && mkdir -p /data \
    && SHELL_BIN=$(find /ms-playwright -type f \( -name headless_shell -o -name chrome-headless-shell \) | head -n1) \
    && test -n "$SHELL_BIN" && ln -s "$SHELL_BIN" /opt/headless-shell && /opt/headless-shell --version \
    && chown -R app:app /app /data /ms-playwright

USER app
ENV HOME=/home/app
# EZMotion (HyperFrames) reuses Playwright's Chrome headless shell instead of
# `hyperframes browser ensure` (its downloader hangs in non-TTY builds).
ENV PRODUCER_HEADLESS_SHELL_PATH=/opt/headless-shell

EXPOSE 4100
# tini is PID 1: it forwards SIGTERM to node and reaps orphaned Chrome/renderer processes. Without it node was
# PID 1, zombies piled up until the container hit its process limit (spawn EAGAIN, Chrome won't launch, DB lost).
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["node", "--import", "tsx", "src/main.ts"]
