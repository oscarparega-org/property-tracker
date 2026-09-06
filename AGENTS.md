# Repository guidance

- Keep deployment naming conventions in `scripts/coolify.mjs`; do not add server addresses, domains, UUIDs, or tokens to source files.
- Keep the public API contract in `packages/shared` when both applications consume it.
- Add Prisma migrations for schema changes; deployments run `prisma migrate deploy` and never `db push`.
- Preserve the single deployment controller: GitHub Actions deploys an exact SHA and Coolify auto-deploy remains disabled.
- Treat `docker-compose.coolify.yml` as production configuration and `docker-compose.yml` as the local developer path.
- Run `npm run check`, `npm run lint`, `npm test`, and `npm run build` before committing.

## Orca worktrees

- Keep the committed setup and archive hooks in `orca.yaml`; select **orca.yaml only**, **Run by default**, and **Wait for setup to complete before starting agent** in Orca repository settings.
- Start an isolated worktree stack with `npm run wt:dev`. It owns a disposable PostgreSQL container and volume, while the API, frontend, and import worker run locally with worktree-specific ports.
- `wt:dev` idempotently seeds the local demo account and one sample property after migrations. Keep this worktree-only; never add seed execution to production Compose or deployment workflows.
- Use the URLs printed by `npm run wt:dev` or `npm run wt:status`; do not assume ports 3000, 5173, or 5432 inside a multi-worktree session.
- Do not share one database between branches. The generated `.env.worktree` is ignored, contains the worktree identity and local secrets, must not be copied between worktrees, and must not be committed.
- Stop a stack without removing its checkout with `npm run wt:down`.
- Orca's archive hook runs `npm run wt:down` before an archive or removal. For command-line removal, run `npm run wt:remove -- /absolute/path/to/worktree` from a different worktree; use `--force` only when intentionally discarding uncommitted changes.
- Do not manually prune shared Docker images or build caches during worktree cleanup; they are reusable across worktrees.
