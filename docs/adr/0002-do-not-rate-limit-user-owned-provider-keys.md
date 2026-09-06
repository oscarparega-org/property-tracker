# ADR-0002: Do not rate limit user-owned provider keys

## Status

Accepted

## Context

Every OpenAI and Firecrawl request uses the authenticated user's own credential. Existing application-wide counters serialized unrelated users and imposed shared limits that did not correspond to provider billing ownership.

## Decision

Remove application write throttles, provider budgets, usage counters, and monthly-limit configuration. Preserve authentication, per-record ownership checks, duplicate-job locks, request body limits, and SSRF protections.

## Consequences

- One user's provider usage no longer blocks another user.
- The import path no longer takes global advisory locks for counters.
- Users remain responsible for limits configured in their provider accounts.
- Abuse protection must be reconsidered before anonymous access, shared application credentials, or materially higher public traffic is introduced.

## Alternatives considered

- Per-user database counters: viable later, but unnecessary while providers enforce limits on user-owned keys.
- Redis rate limiting: rejected because it adds infrastructure without a current requirement.
