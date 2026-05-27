# Image officielle Playwright (Chromium + dépendances système prêtes)
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

# Installer les dépendances en premier pour profiter du cache Docker
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copier le reste du code
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.mjs"]
