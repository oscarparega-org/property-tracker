# Repository guidance

- Keep deployment naming conventions in `scripts/coolify.mjs`; do not add server addresses, domains, UUIDs, or tokens to source files.
- Keep the public API contract in `packages/shared` when both applications consume it.
- Add Prisma migrations for schema changes; deployments run `prisma migrate deploy` and never `db push`.
- Preserve the single deployment controller: GitHub Actions deploys an exact SHA and Coolify auto-deploy remains disabled.
- Treat `docker-compose.coolify.yml` as production configuration and `docker-compose.yml` as the local developer path.
- Run `npm run check`, `npm run lint`, `npm test`, and `npm run build` before committing.
