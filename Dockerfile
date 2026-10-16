# Multi-stage Dockerfile for Untis⁺ (API & Web)
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package definitions and lockfiles
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy full source tree
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/
COPY apps/web/ ./apps/web/
COPY tsconfig.json ./

# Build shared library, API, and Web frontend
RUN npm run build --workspace=@untisplus/shared
RUN npm run build --workspace=@untisplus/api
RUN npm run build --workspace=@untisplus/web

# --- Production Runner Stage ---
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0

# Copy runtime packages
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy built artifacts from builder stage
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Expose API port
EXPOSE 8787

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8787/health || exit 1

CMD ["node", "apps/api/dist/server.js"]
