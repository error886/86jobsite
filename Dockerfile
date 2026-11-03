# 86Job — production image for Coolify (Build Pack: Dockerfile)
#
# Coolify routes https://86job.site to this container's exposed port (80).
# Runtime secrets (SUPABASE_*, GEMINI_API_KEY, OPENROUTER_API_KEY, TMAP_APP_KEY, ADMIN_EMAILS)
# come from Coolify's Environment Variables. VITE_KAKAO_MAP_KEY is baked into the browser
# bundle, so it must be marked as a build variable in Coolify.

# ---------- Build ----------
FROM node:22-alpine AS builder
WORKDIR /app

# `npm install` rather than `npm ci`: the lock file is written on Windows, and npm ci rejects it
# on Linux over platform-only optional packages (Tailwind's and lightningcss' native binaries).
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

COPY . .

# Public browser key for Kakao Maps, passed in by Coolify at build time
ARG VITE_KAKAO_MAP_KEY=""
ENV VITE_KAKAO_MAP_KEY=$VITE_KAKAO_MAP_KEY

RUN npm run build && npm prune --omit=dev

# ---------- Run ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80
ENV DATA_PATH=/app/data

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json

# db.json (local fallback store) is created here on first start; mount a volume on /app/data to keep it
RUN mkdir -p /app/data
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/api/health || exit 1

CMD ["node", "dist/server.cjs"]
