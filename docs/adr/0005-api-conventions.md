# 0005. REST API conventions

- Status: Accepted
- Date: 2026-11-03

## Decision

- **Stack:** Express 5, layered as routes, then controllers, then services (business logic), then repositories (Prisma data access).
- **Versioning:** everything lives under `/api/v1`. Health probes are `/health/live` and `/health/ready`.
- **Validation:** every request body, query and parameter is validated with Zod at the boundary. Schemas live in `packages/shared` and are reused by the web app.
- **Responses:** success is `{ data, meta? }`. Errors are `{ error: { code, message, details?, requestId } }`, with stable `code` values from a shared error taxonomy and correct HTTP status codes. Stack traces never reach clients.
- **Lists:** consistent `page`, `pageSize`, `sort` and filter query parameters, with pagination metadata in `meta`.
- **Writes:** multi-step writes run inside `withTransaction()`. Only parameterised queries are allowed.
- **Docs:** routes are declared with `defineRoute()`, which registers the Zod schemas with `zod-to-openapi`. The OpenAPI document is served with Scalar, so docs cannot drift from code.
- **Security middleware:** `helmet`, a CORS allow-list from configuration, rate limiting and CSRF.
- **Observability:** `pino` and `pino-http` log structured JSON with a request id carried through `AsyncLocalStorage`. Secrets and personal data are redacted.
- **Configuration:** environment variables, loaded with `dotenv` and validated with Zod at startup.
- **Background jobs:** BullMQ on Redis, wired up but unused until a feature needs it.
- **Locale:** `Africa/Nairobi`, Kenyan shillings (KES), English.

## Consequences

Clients can rely on one predictable shape for every endpoint and every error.
