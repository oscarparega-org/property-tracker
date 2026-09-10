# ADR-0006: Share curated properties across users

## Status

Accepted

## Context

Regular users should select preloaded listings instead of creating or importing separate copies. Listing facts change at the source, while decisions and notes must remain private to each search.

## Decision

Represent curated listings as ownerless `Property` records with a `CatalogListing` lifecycle. Searches link directly to the canonical property through `SearchProperty`; that association remains owner-scoped and continues to own all decision data. Private historical properties retain an owner. A database trigger prevents a private property from being linked by another owner.

## Consequences

- One nightly update is immediately visible to every linked search.
- Regular users cannot edit canonical facts.
- Unavailable catalog records remain linked so user history survives.
- Authorization queries must distinguish canonical, membership-accessible, and privately owned records.

## Alternatives considered

- Copy catalog properties per user: rejected because facts drift and every source update fans out.
- Merge user lifecycle into the catalog: rejected because it would expose private data and prevent independent decisions.
