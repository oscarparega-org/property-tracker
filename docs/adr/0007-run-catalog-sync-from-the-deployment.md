# ADR-0007: Run catalog synchronization from the deployment

## Status

Accepted

## Context

The REMAX catalog must reconcile nightly without creating a second deployment controller or depending on host-specific cron configuration.

## Decision

Ship a one-shot catalog command and a dedicated scheduler process in both Compose configurations. The scheduler evaluates 03:00 in `America/Mexico_City`; a database run key and advisory lock make restarts and duplicate processes idempotent. A failed or interrupted daily run becomes retryable once after 15 minutes, and the process heartbeat continues independently while synchronization is running. Discovery must be complete before removals are marked unavailable.

## Consequences

- Scheduling is versioned with the exact deployed SHA.
- A missed run is recovered after the service restarts later that day.
- A transient failure or interrupted run receives one bounded retry without allowing concurrent execution.
- The scheduler adds one small long-running process.
- Source truncation or discovery failure fails closed and cannot remove catalog inventory.

## Alternatives considered

- GitHub Actions cron: rejected because it couples data freshness to deployment credentials and external workflow availability.
- Coolify UI cron: rejected because it is unversioned external state.
- Scheduling inside the API: rejected because API replica count would complicate ownership and health monitoring.
