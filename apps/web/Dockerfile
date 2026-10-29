# apps/web — Next.js public renderer. Multi-stage:
#   runtime (default) — self-contained production image (`next start`)
#   dev               — hot reload for `docker compose` if you want it in a container
#
# `docker compose up` uses `runtime`; day-to-day dev runs on the host
# (`npm run --workspace @trefle/web dev`).
FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV CI=1 NEXT_TELEMETRY_DISABLED=1

# ---- deps: full workspace install ----
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
RUN npm run --workspace @trefle/web build

# ---- dev (optional: containerised hot reload) ----
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 3001
CMD ["npm", "run", "--workspace", "@trefle/web", "dev"]

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json /app/tsconfig.base.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
# apps/web carries its own nested `next` (16.x) + the built .next output
COPY --from=build /app/apps/web ./apps/web
EXPOSE 3001
CMD ["npm", "run", "--workspace", "@trefle/web", "start"]
