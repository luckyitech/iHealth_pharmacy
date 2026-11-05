# @ihealth/db

Prisma client for the **legacy iHealth schema**, plus the additive SQL the new system needs.

- `prisma/schema.prisma` is **generated** by introspecting a copy of the legacy database (`npm run db:pull -w @ihealth/db`), then renamed by `scripts/camelize-schema.js`:
  - models become PascalCase with `@@map("legacy_table")`, and fields become camelCase with `@map("LEGACY_COLUMN")`
  - legacy scratch tables named `#...` become `Temp...` models
  - a relation field that would collide with its foreign-key column gets a `Relation` suffix (`accountType` / `accountTypeRelation`)
- Do not hand-edit table or column mappings. Re-run `db:pull` instead.
- **Prisma Migrate is never used** ([ADR 0003](../../docs/adr/0003-keep-legacy-database-schema.md)). New tables live in `sql/additive/`.
- `npm run db:diff -w @ihealth/db` checks, read-only, that the Prisma schema still matches the reference database. CI runs it against `sql/schema/legacy-schema.sql`.
- `npm run db:report -w @ihealth/db` regenerates [docs/db/unmapped-objects.md](../../docs/db/unmapped-objects.md): the views, routines, triggers, events and key-less tables that the Prisma client does not cover.

```js
import { createPrismaClient } from '@ihealth/db';

const prisma = createPrismaClient({ url: process.env.DATABASE_URL });
const access = await prisma.employeeAccess.findMany({ where: { employeeId: 1, activeS: 'Y' } });
```

Zero dates: the legacy app connected with `zeroDateTimeBehavior=convertToNull`. Repositories must treat `0000-00-00` values as `null` where they still exist.
