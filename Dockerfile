# ── Stage 1: build frontend + install all deps (needs build tools for ssh2) ───
FROM node:24-alpine AS build
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Prune to production deps only (keeps compiled native modules from this stage)
RUN npm prune --omit=dev

# ── Stage 2: lean production image ────────────────────────────────────────────
FROM node:24-alpine
WORKDIR /app

# Copy production node_modules (already compiled) + built frontend + server
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist         ./dist
COPY package.json ./
COPY server.js    ./
COPY routes       ./routes

# Data directory — mount a volume here to persist all app data
RUN mkdir -p data

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server.js"]
