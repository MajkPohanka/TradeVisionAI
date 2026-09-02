# Použijeme stabilní Node.js 20 LTS
FROM node:20-alpine AS builder

WORKDIR /app

# Zkopírujeme package soubory a nainstalujeme závislosti
COPY package*.json ./
RUN npm install

# Zkopírujeme zdrojový kód aplikace
COPY . ./

# Sestavíme aplikaci (Vite frontend + Express backend přes esbuild)
RUN npm run build

# Produkční kontejner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Zkopírujeme package soubory a nainstalujeme pouze produkční závislosti
COPY package*.json ./
RUN npm install --omit=dev

# Zkopírujeme sestavenou složku dist
COPY --from=builder /app/dist ./dist

# Vystavíme port 3000
EXPOSE 3000

# Spustíme server
CMD ["node", "dist/server.cjs"]
