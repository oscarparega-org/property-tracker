FROM node:22-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci

FROM base AS build
WORKDIR /app
COPY --from=deps /app/ ./
COPY tsconfig.base.json turbo.json ./
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend
RUN npm run build --workspace=@template/shared
RUN npm run build --workspace=template-backend

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/backend/dist ./dist
COPY --from=build /app/apps/backend/prisma ./prisma
COPY --from=build /app/apps/backend/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
# npm may keep packages with workspace-specific optional peers here instead of
# hoisting them. Merge those modules where dist/*.js can resolve them.
COPY --from=build /app/apps/backend/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./node_modules/@template/shared/dist
COPY --from=build /app/packages/shared/package.json ./node_modules/@template/shared/package.json
EXPOSE 3000
CMD ["node", "dist/index.js"]
