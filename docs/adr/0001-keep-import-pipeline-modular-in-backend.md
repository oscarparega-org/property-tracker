# ADR-0001: Keep the import pipeline modular inside the backend

## Status

Accepted

## Context

Direct extraction, provider rules, safe HTTP access, Firecrawl, and OpenAI had accumulated in one module. They change for different reasons, but deploying them as separate services would add operational complexity without a demonstrated scaling need.

## Decision

Keep one backend and one worker deployment while separating the import code into transport, generic extraction, provider clients, orchestration, and code-based provider adapters.

## Consequences

- Provider rules remain independently testable and can grow without enlarging the orchestration module.
- The API and worker continue sharing one implementation and deployment artifact.
- A failing provider adapter is isolated in code and tests, not at the process boundary.
- Independent service deployment is deferred until measured load or team ownership requires it.

## Alternatives considered

- Keep one large extraction module: rejected because responsibilities and provider changes were becoming coupled.
- Create provider microservices: rejected because the current scale does not justify distributed-system overhead.
