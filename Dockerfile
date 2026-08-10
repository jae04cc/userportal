# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm install` rather than `npm ci`: npm 11.x omits `"optional": true` on
# vitest's nested @esbuild/* platform packages, which makes `npm ci` fail with
# EBADPLATFORM on Linux. See the same note in .github/workflows/ci.yml.
RUN npm install --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_PATH=/data/userportal.db

# output: "standalone" emits a minimal server bundle with only the deps it needs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# SQLite lives on a mounted volume so it survives container replacement
VOLUME /data

EXPOSE 3000
CMD ["node", "server.js"]
