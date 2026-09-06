# ADR-0004: Share property facts and scope lifecycle to searches

## Status

Accepted

## Context

An account may track the same listing in up to three searches. Listing facts must remain consistent, while status, favorites, notes, ratings, visits, rejection reasons, and archive state may differ.

## Decision

Keep one owner-scoped `Property` record and introduce `SearchProperty` as the many-to-many association that owns lifecycle data. Persist asynchronous destinations in `PropertyImportTarget`. Validate ownership at every API boundary and prohibit duplicate memberships.

## Consequences

- Editing listing facts is immediately visible on the next fetch from every linked search.
- Lifecycle mutations require both a search and property identifier.
- Deleting a search preserves properties linked elsewhere and deletes final-membership orphans.
- Queries must join the selected membership when producing a property response.

## Alternatives considered

- Duplicate properties per search: rejected because edits would drift and imports would be repeated.
- Store per-search lifecycle as JSON on `Property`: rejected because constraints, indexing, and atomic membership changes would be weaker.
