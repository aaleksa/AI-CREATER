FROM node:22-slim

# Fonts for the contact line stamped on pictures (resvg/ffmpeg need a system font on Linux)
RUN apt-get update \
 && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first (better layer cache)
COPY backend/package.json backend/package-lock.json backend/
COPY frontend/package.json frontend/package-lock.json frontend/
RUN npm ci --prefix backend --include=dev && npm ci --prefix frontend --include=dev

# Source + web build (the API serves frontend/dist)
COPY backend backend
COPY frontend frontend
RUN npm run build --prefix frontend

ENV NODE_ENV=production
# Mount a Railway Volume at /data to keep the database and media between deploys
ENV DATA_DIR=/data

EXPOSE 4000
CMD ["npm", "run", "start", "--prefix", "backend"]
