# ADR-0005: Use an additive migration for multi-search

## Status

Accepted

## Context

Production runs `prisma migrate deploy` before the replacement backend becomes healthy. Supporting lifecycle writes from two application schemas would require a temporary bidirectional synchronization layer.

## Decision

Use a brief maintenance window. First add and backfill the multi-search tables. Then lock `Property`, reconcile any property created between the two migrations, validate that every property has a membership, and remove the legacy lifecycle columns before the new API starts.

## Consequences

- Lifecycle data has one source of truth after the cutover.
- The old API must not serve traffic after the cutover migration begins.
- Rollback uses a forward-fix application release; database migrations are not rolled back.

## Alternatives considered

- Drop columns in the feature migration: rejected because the old backend may still be serving traffic.
- Add a new service or database: rejected because it adds operational complexity without improving data safety.
