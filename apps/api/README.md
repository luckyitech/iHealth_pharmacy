# @ihealth/api

Express 5 REST API. Run it with `npm run dev -w @ihealth/api` (reads the root `.env`).

| Path                   | What it serves                                             |
| ---------------------- | ---------------------------------------------------------- |
| `/api/v1/...`          | Versioned API                                              |
| `/api/v1/openapi.json` | OpenAPI 3.1 document, generated from the route definitions |
| `/api/docs`            | API reference (Scalar); not mounted in production          |
| `/health/live`         | Liveness: the process is running                           |
| `/health/ready`        | Readiness: MySQL and Redis answer (otherwise 503)          |

## Layout

```
src/
  config/env.js           environment validated with Zod at startup
  lib/                    logger (pino, redaction), request context (AsyncLocalStorage), AppError
  middleware/             error handler, not-found handler
  http/                   defineRoute(), mountRoutes(), OpenAPI generation
  db/                     withTransaction(), list-query helpers (pagination, sorting)
  infra/                  Redis client, BullMQ queues
  features/<feature>/     routes -> service -> repository, one folder per feature
  routes.js               every route, in one list
```

## Adding an endpoint

```js
export const getEmployee = defineRoute({
  method: 'get',
  path: '/employees/:id',
  summary: 'Get one employee',
  tags: ['Employees'],
  permissions: [PERMISSIONS.MASTER_MASTERS_ENTRY],
  request: { params: idParamsSchema },
  responses: { 200: { description: 'The employee', schema: dataResponseSchema(employeeSchema) } },
  handler: async ({ input }) => ({ data: await employeeService.get(input.params.id) }),
});
```

- Routes are private by default (`access: 'authenticated'`). Opening one up requires `access: 'public'`.
- Validated input is in `input.params`, `input.query` and `input.body`. Express 5 makes `req.query` read-only.
- Throw `AppError` (or a helper such as `notFound()`) for client errors. Anything else becomes a 500 with no internal details.
- Outside production, each response is checked against its documented schema, so the docs cannot drift from the code.
- Writes that touch more than one row go through `withTransaction()`.

## Authentication and authorisation

See [ADR 0004](../../docs/adr/0004-authentication-and-authorisation.md). Endpoints live under `/api/v1/auth`: `login`, `refresh`, `logout`, `me`, `csrf` and `approval-pin/verify`.

- **Cookies:** `ihealth_access` (JWT, 15 minutes), `ihealth_refresh` (opaque, 7 days, rotated on every refresh, path `/api/v1/auth`) and `ihealth_session` (sign-in id that CSRF tokens are bound to). All are `httpOnly` and `SameSite=Strict`, and `Secure` when `COOKIE_SECURE=true` (required in production).
- **CSRF:** every authenticated non-GET request must send the `x-csrf-token` header. The token comes from `login`, `refresh` or `GET /auth/csrf`, and the web app keeps it in memory only.
- **Passwords:** checked against the argon2id hash in `ih_employee_password`, or against the legacy BCrypt/plain-text value, which is then upgraded. `employee_credentials` is never written. If the legacy system changes a password later, the legacy value wins again until the next sign-in upgrades it.
- **Lockout:** 5 failed sign-ins lock a username for 15 minutes (Redis), on top of per-IP rate limits. Unknown usernames take as long as wrong passwords and get the same error. An inactive account is only reported after a correct password.
- **Permissions:** effective permissions are the active `employee_access` grants plus the permissions of the employee's roles (`employee_pharmacy_role` -> `ih_role_permission`), limited to active `pharma_access` rows. They are re-read on every request, so a revoked grant applies immediately. Routes declare `permissions: [PERMISSIONS.X]`, and every denial is audited.
- **Approval PIN:** `POST /auth/approval-pin/verify` checks an approver's PIN exactly like the legacy `verifyApprovalPin` (BCrypt or plain text) and never rewrites it, because legacy screens still compare it in the browser. Five wrong PINs lock that approver for 15 minutes.
- **Audit:** sign-ins (success, failure, denied), password upgrades, refresh-token reuse, sign-outs, permission denials and PIN checks are written to `ih_audit_log` with the request id.

### Differences from the legacy system

| Legacy                                               | New                                                           | Why                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Permissions checked in the browser, by list position | Checked on the server on every request, by `PHARMA_ACCESS_ID` | Browser checks can be bypassed, and list positions break when rows change                        |
| BCrypt / plain-text passwords                        | argon2id in an additive table, upgraded at sign-in            | Plain text is unacceptable for health data; the legacy column stays untouched for the legacy app |
| JWT in browser storage                               | `httpOnly` cookies + CSRF tokens                              | Scripts injected into the page (XSS) cannot steal the session                                    |
| No role permissions                                  | `ih_role_permission` (empty by default)                       | Gives administrators role-based access without changing legacy grants                            |
| Two-factor sign-in (email)                           | Not supported yet: such accounts get `TWO_FACTOR_REQUIRED`    | Planned for a later phase. Refusing the sign-in is safer than skipping the second factor         |

### Integration tests

`npm run test:integration -w @ihealth/api` starts MySQL 9.7.1 and Redis with Testcontainers (Docker required). It loads the committed legacy schema, the additive SQL and the synthetic seed, then runs the real repository end to end. CI runs it on every pull request.
