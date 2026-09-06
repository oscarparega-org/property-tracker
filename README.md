# House Tracker

Private property tracking with a Spanish Next.js interface, a Hono API, Better Auth, Prisma, PostgreSQL, and a separate URL-import worker.

## Fresh-start behavior

There is no seed step, legacy-data import, or automatic account creation. New accounts have an empty collection. Migrations add the property tables without deleting existing authentication data or resetting a database.

After deployment:

1. Open the frontend and create an account.
2. Choose **Agregar** and submit a public property-listing URL.
3. Wait for extraction, review the draft, then select **Publicar**.
4. Check the map/list and save favorites, notes, rating, or a visit date.

Every property, draft, and import belongs to its authenticated owner. Two users may import the same listing independently. Photos remain external URLs; files are not uploaded.

## Local development

Requirements: Node 22.20+, npm 10.9+, Docker Compose.

```bash
npm ci
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
docker compose up -d postgres
npm run db:migrate --workspace=template-backend
npm run dev
```

In another terminal, run `npm run worker:imports`. The frontend uses port 5173 and Hono uses port 3000. Alternatively, `docker compose up --build` runs PostgreSQL, migrations, API, worker, and frontend together.

### Concurrent Orca worktrees

Each worktree can run an isolated development stack without port, database, or authentication-cookie collisions:

```bash
npm ci
npm run wt:init
npm run wt:dev
```

`wt:init` writes an ignored `.env.worktree` with a stable Compose project name, free ports, local secrets, and unique `*.localhost` frontend/API hostnames. Existing configuration is validated against the checkout path so a copied file cannot accidentally share another worktree's database. `wt:dev` starts only that worktree's PostgreSQL service in Docker, deploys the checked-in Prisma migrations, creates an idempotent demo account and property, and runs the backend, frontend, and import worker locally with hot reload. PostgreSQL stays available when the dev process stops so restarts remain fast.

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

The committed `orca.yaml` runs `npm ci && npm run wt:init` when Orca creates a worktree and runs `npm run wt:down` before Orca archives or removes it. In Orca repository settings, select **orca.yaml only**, **Run by default**, and **Wait for setup to complete before starting agent**; leave the local Setup Script and Archive Script fields blank. Configure a default app terminal to run `npm run wt:dev` if every revealed worktree should launch the app automatically. Create a worktree with `orca worktree create --name <name> --agent codex --prompt "<task>" --setup run --json`.

## Personal provider configuration

Each authenticated user configures OpenAI and Firecrawl from **Configuración → Integraciones**. Provider credentials are validated before saving, encrypted at rest, never returned by the API, and used only for jobs owned by that account. Users can independently enable each provider, choose an approved OpenAI model, and set monthly operation limits.

The deployment uses these server-side variables:

| Variable                             | Purpose                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` | Stable base64 secret containing at least 32 random bytes; encrypts user credentials with AES-256-GCM |
| `OPENAI_ALLOWED_MODELS`              | Comma-separated model allowlist; defaults to Luna, Terra, and Sol                                    |
| `FIRECRAWL_CREDIT_LIMIT_MONTHLY`     | Global safety ceiling; default 500 scrape reservations per UTC month                                 |
| `OPENAI_IMPORT_LIMIT_MONTHLY`        | Global safety ceiling; default 100 AI request reservations per UTC month                             |
| `TRUST_PROXY`                        | Defaults to false; enable only if the proxy replaces untrusted forwarded headers                     |

Production reads the encryption key from the `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` secret in the GitHub `dev` environment and the deployment controller writes it to Coolify. Generate it with `openssl rand -base64 32` and keep it out of source control. The key must remain stable and backed up; losing or rotating it requires users to enter their provider credentials again.

New URL imports first make a safe, size-limited HTTP GET and extract HTML, JSON-LD, Open Graph, and embedded metadata. A deterministic confidence gate accepts clear property listings and rejects pages with no property evidence. Borderline pages are rejected when OpenAI is unavailable; when it is enabled, one grounded model response validates the page and completes only supported fields. Firecrawl is never automatic: an existing property's **Mejorar con Firecrawl + IA** action appears only when both providers are active, produces a preview, and fills empty fields plus new images/features without overwriting user-entered values or decisions. User and global budgets reserve operations before requests, including failures and retries, so they are not billing reconciliation.

Hono reserves hourly account limits and daily application limits for URL imports (5/25), manual creation (10/50), and draft updates (15/75). IP limits are also applied when a trusted proxy is configured. IPs are hashed using the authentication secret; an optional `PUBLIC_WRITE_HASH_SECRET` can override it for non-Compose development. CAPTCHA is not used.

The worker polls the database, atomically claims queued jobs, retries up to three attempts, and recovers interrupted work. Each deployment runs one worker. The worker health check verifies its heartbeat; failures exit and the container restart policy restarts it. Monitor failed jobs and worker logs through Coolify.

## Architecture

- `apps/frontend`: UI, maps, galleries, authenticated browser API client.
- `apps/backend`: Hono routes, auth, Prisma migrations, extraction, worker.
- `packages/shared`: property DTOs, request contracts, validation schemas.
- `docker-compose.yml`: local developer stack.
- `docker-compose.coolify.yml`: deployment stack.

All property, import, and provider-settings routes require a session and return private, uncached responses. The frontend does not access Prisma or run property Server Actions. The API owns validation, ownership checks, credential encryption, and persistence. The worker decrypts a credential only for its owner's active job and retains it only in memory for that provider call.

## Deployment

GitHub Actions remains the only deployment controller: quality checks and container builds precede deployment of the exact commit SHA. Coolify auto-deploy stays disabled. Naming and public URL derivation remain in `scripts/coolify.mjs`; deployment addresses, IDs, and tokens are configuration, not source constants.

Organization/repository Actions variables: `COOLIFY_API_URL`, `COOLIFY_SERVER_UUID`, `DEPLOY_BASE_DOMAIN`. Secrets: `COOLIFY_WRITE_TOKEN`, `COOLIFY_DEPLOY_TOKEN`, plus `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` in the GitHub `dev` environment. The existing provisioner manages isolated repository resources and frontend/API domains.

The existing `migrate` service runs `prisma migrate deploy` before the API and worker start. The worker reuses the backend image and exposes no port. Coolify generates PostgreSQL credentials and the Better Auth secret; the deployment controller injects the stable provider-credential encryption key from GitHub's `dev` environment. User provider tokens never enter the frontend build or deployment environment.

Back up the PostgreSQL volume before deploying migrations. Roll back application code through the same exact-SHA pipeline; these additive property tables can remain when rolling back to the auth-only application. Do not reset or drop the database as a deployment step.

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

The browser suite expects the frontend built with the default local API URL, uses ports 3000 and 5179, and tests real signup, encrypted integration setup, private empty collections, URL extraction, draft publication, deep-enhancement preview/apply, saved decisions, and mobile layout. Publisher and provider responses are fixtures; no provider requests are billed. On machines where downloaded Chromium cannot launch, use `PLAYWRIGHT_CHANNEL=chrome npm run test:browser`.

CI runs these suites against a PostgreSQL service before deployment. Tests delete only their own generated accounts and related records. They never connect to the original house database or seed a deployed environment.
