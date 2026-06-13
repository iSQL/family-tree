# --- Build faza: instalira sve zavisnosti i builduje klijent + server ---
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY shared shared
COPY client client
COPY server server
RUN npm run build

# --- Runtime faza: samo produkcijske zavisnosti (better-sqlite3, sharp...) ---
FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist

# Celokupno stanje (SQLite baza, slike, bekapi) živi u /app/data — montirati volume!
ENV PORT=3001 \
    DATA_DIR=/app/data \
    CLIENT_DIST=/app/client/dist
VOLUME /app/data
EXPOSE 3001
WORKDIR /app/server

# Health check preko /api/health (Node 24 ima ugrađen fetch — bez curl/wget).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
