# Full-stack Coolify project template

A reusable monorepo that turns a new public GitHub repository into an isolated development deployment on Coolify. It includes:

- Next.js 16 and Tailwind CSS frontend
- Hono API
- Better Auth email/password signup, sign-in, session, and sign-out
- Prisma and PostgreSQL
- production Docker images and Docker Compose
- GitHub Actions quality gates and idempotent Coolify provisioning

There is no social login, mail provider, email verification flow, or password-reset flow. The template repository deploys normally too, so it can serve as the live example.

## What happens after “Use this template”

```text
new repository push to main
          │
          ├── type-check + lint + test + build
          ├── validate both Docker images
          └── reconcile through the Coolify API
                 ├── project:      {repo}
                 ├── environment:  dev
                 ├── destination:  {repo}-dev
                 ├── network:      repo-{github_repository_id}-dev
                 ├── application:  {repo}-dev
                 ├── frontend:     https://{repo}-dev.{base-domain}
                 └── API:          https://{repo}-api-dev.{base-domain}
```

Provisioning is convergent: rerunning the workflow reuses the managed project, environment, destination, network, and application, then deploys the exact commit SHA. A failed deployment is retained for inspection; the workflow does not delete infrastructure.

## One-time organization setup

1. Host this repository in the GitHub organization, make it public, set `main` as its default branch, and enable **Template repository** in Settings → General.
2. Point a wildcard DNS record for `*.dev.example.com` at the server running Coolify. The example is illustrative; use your own domain.
3. Confirm the Coolify server is validated, its proxy is running, and Coolify can issue TLS certificates for that wildcard's individual hostnames.
4. In GitHub organization Settings → Secrets and variables → Actions, add these **variables** and grant them to all public repositories:

   | Variable | Value |
   | --- | --- |
   | `COOLIFY_API_URL` | Public HTTPS API root, including `/api/v1`, such as `https://coolify.example.com/api/v1` |
   | `COOLIFY_SERVER_UUID` | UUID of the server that will host generated projects |
   | `DEPLOY_BASE_DOMAIN` | Domain only, with no protocol or wildcard, such as `dev.example.com` |

5. Add these organization **secrets**, also available to public repositories:

   | Secret | Purpose |
   | --- | --- |
   | `COOLIFY_WRITE_TOKEN` | Reconciles projects, environments, destinations, applications, and application variables |
   | `COOLIFY_DEPLOY_TOKEN` | Starts deployments |

Use separate least-privilege Coolify tokens if the permissions available in your Coolify version allow it. If Coolify tokens cannot be limited by operation, both GitHub secrets may contain the same token. Keep the Coolify instance and tokens private; the API URL, server UUID, and base domain are configuration, not source-code constants.

GitHub Free supports public organization repositories and public-repository Actions usage. Organization secrets/variables must be explicitly made available to the generated public repositories. See GitHub's documentation for [template repositories](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository), [organization variables](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables), and [organization secrets](https://docs.github.com/en/actions/how-tos/security-for-github-actions/security-guides/using-secrets-in-github-actions).

## Create a project

1. Select **Use this template → Create a new repository**.
2. Create it in the configured organization as a **public** repository.
3. Use a lowercase repository name containing only letters, numbers, and hyphens, with at most 55 characters.
4. Open Actions → **CI and development deployment** and follow the first run.

No repository-specific variables or secrets are required. The generated repository's first push runs the workflow. When it succeeds, the job summary contains both public URLs.

If wildcard DNS is unavailable, create the two derived DNS records before rerunning the workflow. Resource names and URL rules intentionally live in [`scripts/coolify.mjs`](scripts/coolify.mjs), not in GitHub configuration.

## Run locally

Requirements: Node 22.20+, npm 10.9+, and Docker with Compose.

For the closest production-like path:

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:5173`. PostgreSQL data is stored in the `pgdata` volume. Stop the stack with `docker compose down`; add `--volumes` only when you intentionally want to erase the local database.

For application development with only PostgreSQL in Docker:

```bash
npm ci
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
docker compose up -d postgres
npm run db:migrate --workspace=template-backend
npm run dev
```

The frontend runs at `http://localhost:5173` and the API at `http://localhost:3000`.

## Verification commands

```bash
npm run check
npm run lint
npm test
npm run build
docker compose -f docker-compose.yml config
docker compose -f docker-compose.yml build
```

The CI workflow runs all of these checks before provisioning or deployment. The Coolify file contains Coolify's `exclude_from_hc` extension for the one-shot migration service, so stock Docker Compose validation uses the equivalent local file. Dependabot checks npm packages, Docker base images, and GitHub Actions weekly.

## Deployment design and safety

- The Coolify Compose file uses Coolify magic variables to generate the PostgreSQL password and Better Auth secret inside Coolify; they never pass through GitHub logs.
- Frontend and API domains are configured on the corresponding Compose services. The API URL is injected at frontend build time because browser code cannot discover it later.
- Every repository receives a dedicated Coolify Docker destination and network. The application is also tagged with the immutable GitHub repository ID so renames do not cause lookup ambiguity.
- The script refuses to take over a same-named project unless its management marker matches the current GitHub repository ID.
- API failures report the endpoint and status only, never response bodies or token values.
- Automatic Coolify GitHub webhooks are disabled. GitHub Actions is the single deployment controller and deploys `GITHUB_SHA`.
- The frontend publishes a restrictive robots policy. This is a development environment, not a production topology; authentication or network restrictions are still required if it must be private.

The automation uses Coolify's documented [REST API](https://coolify.io/docs/api-reference/api) to manage the resources. Since Coolify evolves independently, upgrade Coolify deliberately and run `node --test scripts/coolify.test.mjs` after changing the reconciliation contract.

## Removing a generated deployment

Deletion is intentionally not automated. In Coolify, delete the application first, then the `{repo}-dev` destination/network, and finally the `{repo}` project if it contains nothing else. This protects the PostgreSQL volume and failed deployments from accidental cleanup.

## Repository map

```text
apps/frontend/              Next.js UI and Better Auth client
apps/backend/               Hono API, Better Auth server, Prisma schema/migrations
packages/shared/            shared API contracts
docker-compose.yml          local production-like stack
docker-compose.coolify.yml  Coolify stack with generated secrets
scripts/coolify.mjs         idempotent provisioning and deployment
.github/workflows/ci.yml    build, container validation, and dev deployment
```

## Scope

This template intentionally creates only the fixed `dev` environment. Production promotion, backups, monitoring, mail delivery, password recovery, and social providers should be designed per application rather than silently inherited from a starter.
