# Build context is the repository root:
#   docker build -f docker/Dockerfile -t halero .
#
# Two stages. The build stage installs everything (including the web
# toolchain, which pulls in native binaries) and builds the SPA. The
# runtime stage installs production dependencies only and copies the
# built SPA in, so the final image carries zero compiled .node
# artifacts. CI asserts that invariant on every build.

FROM oven/bun:1.3.3-slim AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY modules ./modules
COPY connectors ./connectors
# The Raycast client is not part of the image, but its manifest must be
# present for the frozen lockfile to resolve the workspace tree.
COPY clients/raycast/package.json ./clients/raycast/package.json
RUN bun install --frozen-lockfile
RUN bun run --filter '@halero/web' build

FROM oven/bun:1.3.3-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HALERO_DATA_DIR=/data
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/server ./apps/server
COPY apps/web/package.json ./apps/web/package.json
COPY packages ./packages
COPY modules ./modules
COPY connectors ./connectors
# Manifest only, same reason as the build stage. All Raycast extension
# dependencies are devDependencies, so the production install stays
# native-module-free.
COPY clients/raycast/package.json ./clients/raycast/package.json
RUN bun install --frozen-lockfile --production
COPY --from=build /app/apps/web/dist ./apps/web/dist
# The bun user and group ship with the oven/bun image.
RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME /data
EXPOSE 4253
# Liveness, not readiness: /healthz answers 200 for both "ok" and
# "degraded", so a degraded instance (stuck connection, stale
# scheduler) still counts as a healthy container. Degradation is
# surfaced through the /healthz body and notifications instead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["bun", "-e", "const r = await fetch(`http://localhost:${process.env.HALERO_PORT ?? 4253}/healthz`); process.exit(r.ok ? 0 : 1)"]
CMD ["bun", "apps/server/src/main.ts"]
