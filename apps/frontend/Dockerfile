FROM node:22-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci

FROM base AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
COPY --from=deps /app/ ./
COPY tsconfig.base.json turbo.json ./
COPY packages/shared ./packages/shared
COPY apps/frontend ./apps/frontend
RUN npm run build --workspace=@template/shared
RUN npm run build --workspace=template-frontend

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/apps/frontend/public ./apps/frontend/public
COPY --from=build --chown=nextjs:nodejs /app/apps/frontend/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/frontend/.next/static ./apps/frontend/.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "apps/frontend/server.js"]
