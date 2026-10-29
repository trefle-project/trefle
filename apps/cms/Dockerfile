# apps/cms — Payload CMS + admin. Multi-stage:
#   runtime (default) — self-contained production image (`next start`)
#   dev               — hot reload for `docker compose` if you want it in a container
#
# `docker compose up` uses `runtime`; day-to-day dev runs on the host
# (`npm run --workspace @trefle/cms dev`).
FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV CI=1 NEXT_TELEMETRY_DISABLED=1

# ---- deps: full workspace install (dev deps included — the build needs
#      typescript, and seed:dev needs tsx) ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/grapesjs-page-import/package.json packages/grapesjs-page-import/package.json
COPY apps/cms/package.json apps/cms/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,target=/root/.npm npm ci

# ---- build ----
FROM deps AS build
COPY . .
# Placeholders: the Payload config validates these at load time, but `next build`
# does not connect to the database (push:false, migrations only).
ENV PAYLOAD_SECRET=build-placeholder \
    DATABASE_URL=postgres://build:build@localhost:5432/build
RUN npm run --workspace @trefle/cms build

# ---- dev (optional: containerised hot reload) ----
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "--workspace", "@trefle/cms", "dev"]

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json /app/tsconfig.base.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/grapesjs-page-import ./packages/grapesjs-page-import
COPY --from=build /app/apps/cms ./apps/cms
EXPOSE 3000
CMD ["npm", "run", "--workspace", "@trefle/cms", "start"]
