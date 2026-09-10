# ADR-0003: Apply a Content Security Policy while allowing external listing images

## Status

Accepted

## Context

House Tracker renders images hosted by property publishers and loads OpenStreetMap tiles. Restricting images to a fixed domain list would break the generic importer, while omitting a policy leaves unrelated browser capabilities unrestricted.

## Decision

Send a request-scoped, nonce-based Content Security Policy and complementary browser security headers from the Next.js proxy. Render application routes dynamically so Next.js can attach that nonce to its bootstrap and client-bundle scripts. Allow HTTPS images, the configured API origin, OpenStreetMap tiles, and same-origin workers. Deny frames, objects, camera, microphone, and geolocation.

## Consequences

- Browser resource loading is restricted without breaking current providers.
- Any future external script, connection, map source, or embedded content requires an explicit policy change.
- Scripts and styles must carry the per-request nonce; arbitrary inline execution is blocked. This gives up static route generation because the nonce must be created for each response.
- Transport security remains the deployment proxy's responsibility so local production-mode browser tests can continue using HTTP.

## Alternatives considered

- Fixed image-domain allowlist: rejected because generic listing sources are intentionally supported.
- No CSP: rejected because the application handles private user data and third-party content.
