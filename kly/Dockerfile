# Kly cold-email worker. Build context = repo root:
#   docker build -f kly/Dockerfile -t komendly-kly .
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=4200

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app && useradd --system --gid app --create-home --home-dir /home/app app

WORKDIR /app
# Kly generates Prisma from the root schema and imports shared web files + the engine's Codex provider/queue directly.
COPY prisma/schema.prisma prisma/schema.prisma
COPY src/lib/ads/contracts.ts src/lib/ads/contracts.ts
COPY src/lib/ads/billing-config.ts src/lib/ads/billing-config.ts
COPY src/lib/ads/meta/core/crypto.ts src/lib/ads/meta/core/crypto.ts
COPY src/lib/kly/social-core.ts src/lib/kly/social-core.ts
COPY src/lib/ads/outbound/copy.ts src/lib/ads/outbound/policy.ts src/lib/ads/outbound/inbound.ts src/lib/ads/outbound/
COPY engine/src/db.ts engine/src/db.ts
COPY engine/src/providers/ engine/src/providers/
COPY engine/src/queue/ engine/src/queue/
COPY engine/src/net/ engine/src/net/
COPY engine/src/util/ engine/src/util/
# The Codex provider also imports the engine's image-mime helper (and sharp, in kly/package.json).
COPY engine/src/storage/image-mime.ts engine/src/storage/image-mime.ts
COPY kly/package.json kly/package-lock.json kly/
COPY kly/scripts/prisma-generate.mjs kly/scripts/prisma-generate.mjs

WORKDIR /app/kly
# devDependencies kept: Kly runs TS via tsx.
RUN npm ci --include=dev && npm cache clean --force
COPY kly/ ./
# Shared files under /app/src and /app/engine resolve packages from Kly's node_modules.
RUN ln -s /app/kly/node_modules /app/node_modules \
    && node scripts/prisma-generate.mjs \
    && chown -R app:app /app

USER app
ENV HOME=/home/app
EXPOSE 4200
# Run node directly (npm does not forward SIGTERM for graceful shutdown).
CMD ["node", "--import", "tsx", "src/main.ts"]
