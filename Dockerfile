FROM node:22-alpine

LABEL org.opencontainers.image.source=https://github.com/ydorb-design/rs-companion

ENV NODE_ENV=production \
    PORT=8417 \
    DATA_DIR=/data

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public

# Runs as root so it can write to bind-mounted folders created by NAS UIs.
RUN mkdir -p /data
VOLUME /data
EXPOSE 8417

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
