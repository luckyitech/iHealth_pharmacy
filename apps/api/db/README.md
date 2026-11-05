# Database code (`apps/api/db`)

The Prisma client for the **legacy iHealth schema**, plus the additive SQL the new system needs. It is part of the API: import it as `#db` (a [package import](https://nodejs.org/api/packages.html#subpath-imports) defined in `apps/api/package.json`).

- `prisma/schema.prisma` is **generated** by introspecting a copy of the legacy database (`npm run db:pull -w @ihealth/api`), then renamed by `scripts/camelize-schema.js`:
  - models become PascalCase with `@@map("legacy_table")`, and fields become camelCase with `@map("LEGACY_COLUMN")`
  - legacy scratch tables named `#...` become `Temp...` models
  - a relation field that would collide with its foreign-key column gets a `Relation` suffix (`accountType` / `accountTypeRelation`)
- Do not hand-edit table or column mappings. Re-run `db:pull` instead.
- **Prisma Migrate is never used** ([ADR 0003](../../../docs/adr/0003-keep-legacy-database-schema.md)). New tables live in `sql/additive/`.
- `npm run db:diff -w @ihealth/api` checks, read-only, that the Prisma schema still matches the reference database. CI runs it against `sql/schema/legacy-schema.sql`.
- `npm run db:report -w @ihealth/api` regenerates [docs/db/unmapped-objects.md](../../../docs/db/unmapped-objects.md): the views, routines, triggers, events and key-less tables that the Prisma client does not cover.

```js
import { createPrismaClient } from '#db';

const prisma = createPrismaClient({ url: config.databaseUrl, timezone: config.region.dbTimeZone });
const access = await prisma.employeeAccess.findMany({ where: { employeeId: 1, activeS: 'Y' } });
```

**Zero dates.** Many legacy rows hold `0000-00-00 00:00:00` in timestamp columns (for example 20 of 33 hospitals in `LAST_UPDATE_TS`). The legacy app connected with `zeroDateTimeBehavior=convertToNull`. Prisma cannot read such a value: selecting it fails the whole query with "Invalid time value". So:

- Never select a legacy timestamp or date column through a Prisma model. Leave it out of `select`.
- When a date is really needed, read it with raw SQL, e.g. `NULLIF(LAST_UPDATE_TS, 0)` or `IF(YEAR(x) = 0, NULL, x)`.
- Writes always set `LAST_UPDATE_TS`, because the column's default is a zero date, which strict SQL mode rejects.
