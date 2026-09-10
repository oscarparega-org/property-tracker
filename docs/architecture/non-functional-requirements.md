# Non-functional requirements

These targets describe the current single-region modular monolith. They are release and operations criteria, not promises to end users.

## Service targets

| Area                   | Target                                                  | Measurement                                    |
| ---------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| Availability           | 99.5% monthly                                           | External checks for frontend and API `/health` |
| API latency            | p95 below 500 ms, excluding third-party imports         | Access logs or platform HTTP metrics           |
| Catalog page           | Largest Contentful Paint below 2.5 s at p75             | Browser telemetry when available               |
| Catalog freshness      | Successful enabled-source sync within 36 hours          | `GET /api/catalog/status`                      |
| Import recovery        | Interrupted jobs recovered within 10 minutes            | Worker logs and queued-job age                 |
| Recovery point         | At most 24 hours of database loss                       | Daily PostgreSQL backup                        |
| Recovery time          | Service restored within 4 hours                         | Quarterly restore exercise                     |
| Initial scale envelope | 100 concurrent users and 10,000 active catalog listings | Load test before exceeding either limit        |

## Security baseline

- TLS terminates at the deployment proxy.
- Better Auth rate-limits sign-in and sign-up endpoints.
- Authorization is enforced in the API and database ownership constraints.
- Provider credentials use AES-GCM encryption with per-record authenticated data.
- Public URL fetching rejects local/private destinations and validates every redirect.
- The frontend uses a per-request CSP nonce; production scripts do not allow `unsafe-inline`.
- The single config-managed administrator is created idempotently through Better Auth and promoted or demoted by exact `ADMIN_EMAIL` reconciliation. Bootstrap never overwrites an existing password or logs the configured password. Manually assigned administrators are unaffected.

Email verification is not required until a transactional email provider is configured. Before public growth beyond the initial scale envelope, add verified-email delivery and account-recovery monitoring.

## Failure modes

| Failure                     | Behavior                                                           | Required response                                                |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| PostgreSQL unavailable      | API health fails; workers log and back off                         | Restore connectivity; workers resume without manual job mutation |
| RE/MAX unavailable          | Sync is recorded failed/partial and retried once after 15 minutes  | Alert if catalog status becomes stale                            |
| Import provider unavailable | Job receives exponential retry scheduling, then a terminal failure | User can retry or capture manually                               |
| Worker restart              | In-progress jobs are reclaimed after five minutes                  | No operator action unless retries are exhausted                  |
| Catalog record disappears   | Public listing becomes unavailable; personal decisions remain      | No destructive deletion                                          |

## Backup and restore runbook

1. Configure a daily PostgreSQL backup in the deployment platform with seven daily and four weekly restore points.
2. Encrypt backup storage and keep credentials outside the repository.
3. Quarterly, restore the newest backup into an isolated database.
4. Run `prisma migrate status`, API `/health`, and a catalog count comparison against the restored database.
5. Record restore duration, backup timestamp, row-count differences, and the operator in the deployment incident log.
6. Never test a restore against the production database or a developer worktree database.

The application intentionally remains single-region. Multi-region database complexity is deferred until the 99.5% availability target or recovery targets cannot be met economically.
