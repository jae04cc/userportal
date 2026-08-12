# Multi-stage build for a minimal production image.

# ---- Stage 1: deps ----
# node:20-slim (Debian/glibc), NOT alpine. libsql ships a musl prebuild whose
# binary fails to load on Alpine — "Error relocating @libsql/linux-x64-musl:
# fcntl64: symbol not found" — which kills the build the moment anything
# touches the database.
FROM node:20-slim AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# ---- Stage 2: builder ----
FROM node:20-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time placeholder; the real path is supplied at runtime.
ENV DATABASE_PATH=/data/userportal.db
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- Stage 3: runner ----
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_PATH=/data/userportal.db
ENV UPLOADS_DIR=/data/uploads

# output: "standalone" emits only the server bundle and the deps it needs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Break-glass recovery. The standalone bundle contains only what the server
# imports, so without this the documented lockout fix
#   docker exec userportal node scripts/reset-admin.mjs
# fails with "Cannot find module" — precisely when you can't sign in to fix it
# any other way. @libsql/client is already traced into standalone/node_modules,
# so the script needs nothing else.
COPY --from=builder /app/scripts/reset-admin.mjs ./scripts/reset-admin.mjs

# Holds the SQLite database and uploaded service icons
RUN mkdir -p /data/uploads
VOLUME ["/data"]

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Uses Node's built-in fetch so nothing extra needs installing. A non-zero exit
# flips the container to "unhealthy" so Docker and Pangolin can react.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
