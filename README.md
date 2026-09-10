# House Tracker

Property discovery and private search tracking with a Spanish Next.js interface, a Hono API, Better Auth, Prisma, PostgreSQL, a URL-import worker, and a nightly curated-catalog scheduler.

## Fresh-start behavior

Production does not create demo accounts or reset application data. Migrations preserve authentication data, create the CDMX / Benito Juárez / Narvarte Poniente location hierarchy, and register the versioned REMAX catalog source. New accounts start without searches but can browse the public catalog immediately.

After deployment:

1. Open the frontend and browse the curated catalog.
2. Create an account and up to three named searches.
3. Add a canonical catalog property to a search, import a public listing URL, or capture a property manually.
4. Review imported drafts before publishing them; manual entries can be saved as drafts or published directly.
5. Compare properties and save status, favorites, notes, rating, or a visit date independently in each search.

Every search, personal property, draft, import, and provider credential belongs to its authenticated owner. Curated catalog properties are ownerless canonical records shared across users. An account may have up to three searches, and one property can belong to several searches: listing facts are shared while status, favorites, notes, ratings, visits, rejection reasons, and archive state remain private per search. Two users may still import the same non-catalog listing independently. Photos remain external URLs; files are not uploaded.

The multi-search migration was introduced additively and then finalized in a maintenance-window migration. Existing accounts receive a primary search named **Mi búsqueda**; lifecycle data now has one source of truth in `SearchProperty`, and rollback requires a forward fix.

## Local development

Requirements: Node 22.20+, npm 10.9+, Docker Compose.

```bash
npm ci
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
docker compose up -d postgres
npm run db:migrate --workspace=house-tracker-backend
npm run dev
```

In additional terminals, run `npm run worker:imports` and `npm run catalog:sync --workspace=house-tracker-backend` when testing those processes directly. The frontend uses port 5173 and Hono uses port 3000. Alternatively, `docker compose up --build` runs PostgreSQL, migrations, API, import worker, catalog scheduler, and frontend together.

### Concurrent Orca worktrees

Each worktree can run an isolated development stack without port, database, or authentication-cookie collisions:

```bash
npm ci
npm run wt:init
npm run wt:dev
```

`wt:init` writes an ignored `.env.worktree` with a stable Compose project name, free ports, local secrets, and unique `*.localhost` frontend/API hostnames. New worktrees receive local `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD` values (the demo account by default); supply all three in the setup process environment to override them. Existing configuration is validated against the checkout path so a copied file cannot accidentally share another worktree's database. `wt:dev` starts only that worktree's PostgreSQL service in Docker, deploys the checked-in Prisma migrations, creates the idempotent admin and demo property, and runs the backend, frontend, import worker, and catalog scheduler locally with hot reload. PostgreSQL stays available when the dev process stops so restarts remain fast.

Sign in with `demo@property-tracker.local` and `demo-password-123`. Restarting the stack preserves edits to the demo property and recreates only missing seed records. Set `DEV_SEED_ENABLED=false` in `.env.worktree` to opt out, or run `npm run wt:seed` to restore missing seed records manually.

Inspect or stop the current stack with:

```bash
npm run wt:status
npm run wt:down
```

To remove a completed worktree with no per-worktree resources left behind, run the following from a different checkout:

```bash
npm run wt:remove -- /absolute/path/to/worktree
```

The removal command refuses dirty worktrees by default. Passing `--force` explicitly discards uncommitted changes. If `.env.worktree` has already been deleted, cleanup derives the Compose project from the checkout path so its containers and volume are still removed. Shared Docker images, Docker build cache, and the npm download cache are retained because they make subsequent worktrees faster.

The committed `orca.yaml` runs `npm ci && npm run wt:init` when Orca creates a worktree, starts `npm run wt:dev` in a dedicated **App** terminal after setup, opens the generated worktree frontend URL in an Orca browser tab when it is ready, and runs `npm run wt:down` before Orca archives or removes it. In Orca repository settings, select **orca.yaml only**, **Run by default**, and **Wait for setup to complete before starting agent**; leave the local Setup Script and Archive Script fields blank. Create a worktree with `orca worktree create --name <name> --agent codex --prompt "<task>" --setup run --json`.

## Personal provider configuration

Each authenticated user configures OpenAI and Firecrawl from **Configuración → Integraciones**. Provider credentials are validated before saving, encrypted at rest, never returned by the API, and used only for jobs owned by that account. Users can independently enable each provider and choose an approved OpenAI model.

The deployment uses these server-side variables:

| Variable                             | Purpose                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` | Stable base64 secret containing at least 32 random bytes; encrypts user credentials with AES-256-GCM |
| `OPENAI_ALLOWED_MODELS`              | Comma-separated model allowlist; defaults to Luna, Terra, and Sol                                    |

Production reads the encryption key from the `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` secret in the GitHub `dev` environment and the deployment controller writes it to Coolify. Generate it with `openssl rand -base64 32` and keep it out of source control. The key must remain stable and backed up; losing or rotating it requires users to enter their provider credentials again.

New URL imports first make a safe, size-limited HTTP GET and extract HTML, JSON-LD, Open Graph, and embedded metadata. A deterministic confidence gate accepts clear property listings and rejects pages with no property evidence. Borderline pages are rejected when OpenAI is unavailable; when it is enabled, one grounded model response validates the page and completes only supported fields. Firecrawl is never automatic: an existing property's **Mejorar con Firecrawl + IA** action appears only when both providers are active, produces a preview, and fills empty fields plus new images/features without overwriting user-entered values or decisions. Provider calls use the authenticated user's own credential and are not rate limited by the application.

The worker polls the database, atomically claims queued jobs, retries up to three attempts with exponential backoff, recovers interrupted work, and survives transient database polling failures. Each deployment runs one worker. The worker health check verifies its heartbeat; failures exit and the container restart policy restarts it. Monitor failed jobs and worker logs through Coolify.

## Architecture

- `apps/frontend`: UI, maps, galleries, authenticated browser API client.
- `apps/backend`: Hono routes, auth, Prisma migrations, extraction, worker.
- `packages/shared`: property DTOs, request contracts, validation schemas.
- `docker-compose.yml`: local developer stack.
- `docker-compose.coolify.yml`: deployment stack.

Operational targets, failure behavior, and the backup/restore exercise are defined in [the non-functional requirements](docs/architecture/non-functional-requirements.md). Architecture decisions are recorded in `docs/adr`; ADR 0008 covers the catalog hardening and scale envelope. `GET /api/catalog/status` exposes freshness and last-run status for every enabled source.

Catalog reads and capability discovery are public. Search, personal-property, import, provider-settings, and catalog-administration writes require a session and return private, uncached responses. The frontend does not access Prisma. The API owns validation, authorization, credential encryption, and persistence. The worker decrypts a credential only for its owner's active job and retains it only in memory for that provider call. A database trigger prevents another user from linking a private property while permitting ownerless canonical catalog records.

## Deployment

GitHub Actions remains the only deployment controller: quality checks and container builds precede deployment of the exact commit SHA. Coolify auto-deploy stays disabled. Naming and public URL derivation remain in `scripts/coolify.mjs`; deployment addresses, IDs, and tokens are configuration, not source constants.

GitHub `dev` environment variables: `COOLIFY_API_URL`, `COOLIFY_SERVER_UUID`, `DEPLOY_BASE_DOMAIN`, `ADMIN_EMAIL`, and `ADMIN_NAME`. Secrets: `COOLIFY_WRITE_TOKEN`, `COOLIFY_DEPLOY_TOKEN`, `ADMIN_PASSWORD`, and `PROVIDER_CREDENTIAL_ENCRYPTION_KEY`. The existing provisioner manages isolated repository resources and frontend/API domains.

The `migrate` service runs `prisma migrate deploy`, creates the initial Better Auth account from `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD` when it does not exist, and synchronizes its admin role before the API, workers, and frontend start. Later deployments never replace the account name or password. The plaintext bootstrap password is not logged and is exposed only to the one-shot migration service; PostgreSQL stores Better Auth's password hash. The finalized multi-search cutover locks `Property`, reconciles every property into a search, and removes old lifecycle columns before replacement code serves traffic. The import worker and catalog scheduler reuse the backend image and expose no ports. The scheduler runs enabled catalog sources after 03:00 in `America/Mexico_City`, uses database locks and run records for idempotency, and retries one stale or failed daily run. Coolify generates PostgreSQL credentials and the Better Auth secret; the deployment controller injects the stable provider-credential encryption key from GitHub's `dev` environment. User provider tokens never enter the frontend build or deployment environment.

Back up the PostgreSQL volume before deploying migrations. Roll back application code through the same exact-SHA pipeline, and review migration compatibility before selecting an older release because production migrations are forward-only. Do not reset or drop the database as a deployment step.

## Verification

```bash
npm run check
npm run lint
npm test
npm run build
docker compose -f docker-compose.yml config --quiet
docker compose -f docker-compose.yml build
```

Database/browser tests require a separate disposable database whose name ends in `_test`:

```bash
export TEST_DATABASE_URL=postgresql://test:test@localhost:55439/house_tracker_test
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
npm run test:e2e
npx playwright install chromium
npm run test:browser
```

The browser suite expects the frontend built with its test API URL and tests real signup, all three add-property entry paths, public catalog filtering, login handoff, canonical-property attachment, private decisions, and responsive layout. Publisher and provider responses are fixtures; no provider requests are billed. On machines where downloaded Chromium cannot launch, use `PLAYWRIGHT_CHANNEL=chrome npm run test:browser`.

CI runs these suites against a PostgreSQL service before deployment. Tests delete only their own generated accounts and related records. They never connect to the original house database or seed a deployed environment.
