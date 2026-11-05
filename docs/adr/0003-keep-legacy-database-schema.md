# 0003. Keep the legacy database schema unchanged

- Status: Accepted
- Date: 2026-11-03

## Context

The production MySQL database (`ihealthpharm`) has to be importable into the new system as it is.
The legacy application and its database are read-only references.

## Decision

- The Prisma schema is produced by introspection (`prisma db pull`) against a local copy of the legacy database.
  Models and fields get camelCase names through `@@map` and `@map`. Table and column names in MySQL do not change.
- **Prisma Migrate is never run against the legacy schema.**
  A schema-diff check script fails CI when the Prisma schema and the reference schema drift apart.
- Anything new (refresh tokens, upgraded password hashes, role permissions, audit log) goes into **additive tables only**, created by plain SQL files in `packages/db/sql/additive/`.
  Additive tables never change or drop legacy columns or tables. Indexes may be added where they do not change semantics.
- Development uses a Docker MySQL server on the same version as the legacy server, restored from a read-only `mysqldump` of the local legacy database.
  Automated tests use a schema-only dump and a small synthetic seed. Real data never goes into the repository.
- Views, triggers, stored procedures and events that Prisma cannot model are listed in a generated report and called through parameterised raw queries.
- Money uses `decimal.js` and is never floating point.

## Consequences

- The production import stays a dump-and-restore with additive SQL applied on top. There is no data transformation step.
- Legacy naming and design quirks remain in the database and are hidden behind camelCase model names and repositories.
- Schema changes beyond additive tables need a new ADR.
