# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

# One-shot migration runner: needs the Prisma CLI from devDependencies.
FROM deps AS migrate
COPY prisma.config.ts ./
COPY src/prisma ./src/prisma
COPY migrations ./migrations
USER node
CMD ["node", "node_modules/prisma/dist/prisma.js", "db", "migrate", "--config", "prisma.config.ts", "--yes"]

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
