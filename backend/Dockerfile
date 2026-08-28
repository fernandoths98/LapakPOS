# syntax=docker/dockerfile:1
# LapakPOS API — build from the monorepo root as context:
#   docker build -f backend/Dockerfile -t kotdee-lapak-api .
# (the kotdee-stack compose sets build.context to the repo root)

# ── build stage ───────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# All workspace manifests first (npm ci validates the whole tree against the
# lockfile), for a cached install layer. mobile/package.json is copied but its
# deps are not installed.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY mobile/package.json ./mobile/

# Install just the backend + shared workspaces (skips the heavy react-native
# deps under mobile/). Falls back to a full install on older npm.
RUN npm ci --include-workspace-root --workspace=backend --workspace=shared \
    || npm ci

COPY shared ./shared
COPY backend ./backend

RUN npm run build --workspace shared \
 && npm run prisma:generate --workspace backend \
 && npm run build --workspace backend \
 && mkdir -p backend/node_modules

# Drop devDependencies for the runtime image.
# Keep the lockfile-pinned Prisma CLI for migrations at container startup.
# Do not let npx download a different CLI version in production.

# ── runtime stage ─────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Prisma's query engine needs openssl + CA certs on slim.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /app/backend
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/src/index.js"]
