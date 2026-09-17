FROM node:20-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --ignore-scripts

COPY . .
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1 \
    UV_THREADPOOL_SIZE=1 \
    NODE_OPTIONS="--max-old-space-size=4096"

RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=6012 \
    HOSTNAME="0.0.0.0"

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 6012

CMD ["node", "server.js"]
