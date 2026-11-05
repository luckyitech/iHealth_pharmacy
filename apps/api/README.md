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
