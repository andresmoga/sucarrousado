# syntax=docker/dockerfile:1.7
# Carro Usado: un solo contenedor con la API (Fastify) que también sirve la web (React ya compilada).
# Construir:  docker build -t carro-usado .
# Probar:     docker run --env-file .env.production -p 8080:8080 carro-usado

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
WORKDIR /app

# ── 1. Compilar web y API con todas las dependencias ──
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY packages packages
COPY apps apps
RUN pnpm --filter @tcu/shared test \
 && pnpm --filter @tcu/web build \
 && pnpm --filter @tcu/api build

# ── 2. Solo las dependencias de producción de la API ──
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile --filter @tcu/api

# ── 3. Imagen final: Node + ffmpeg (video para redes) ──
FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=8080 \
    WEB_DIST=/app/web \
    FONT_DIR=/app/apps/api/assets/fonts
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/db ./apps/api/db
COPY --from=build /app/apps/api/assets ./apps/api/assets
COPY --from=build /app/apps/web/dist ./web
RUN mkdir -p /app/apps/api/uploads && chown -R node:node /app/apps/api/uploads
USER node
WORKDIR /app/apps/api
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Aplica las migraciones pendientes y arranca. Si falta una variable obligatoria, el servidor dice cuál y se detiene.
CMD ["sh", "-c", "node dist/migrate.js && node dist/server.js"]
