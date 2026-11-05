# iHealth Pharmacy

A modern rebuild of the iHealth pharmacy system with a React frontend and a Node.js backend.
It runs on the **same MySQL schema** as the legacy system, so the production database can be imported unchanged.

> The legacy application and its database are **read-only references**. Nothing in this repository writes to them.

## Requirements

| Tool           | Version                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| Node.js        | 24 LTS (see `.nvmrc`; run `nvm use`)                                     |
| npm            | 11+ (npm workspaces; pnpm and yarn are not used)                         |
| Docker Desktop | Runs MySQL, Redis and Mailpit ([runbook](docs/runbooks/dev-database.md)) |

## Getting started

```bash
nvm use
npm install
cp .env.example .env
npm run check
npm run docker:up      # MySQL 9.7.1, Redis, Mailpit
npm run db:copy        # read-only copy of the legacy database into Docker
npm run db:test:load   # test database: schema + synthetic seed
npm run db:dev-admin   # local admin "dev.admin" (password saved in .env)
npm run db:dev-test-passwords  # every account in the copy: one test password (DEV_TEST_PASSWORD)
npm run dev            # API on http://localhost:4000, web app on http://localhost:5180
```

`npm install` also installs the Git hooks (Husky). For database details, see [docs/runbooks/dev-database.md](docs/runbooks/dev-database.md).

## Scripts

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | Starts every app in watch mode (Turborepo)                |
| `npm run build`     | Builds every workspace                                    |
| `npm run test`      | Runs every workspace's tests                              |
| `npm run lint`      | ESLint on the whole repo, zero warnings allowed           |
| `npm run format`    | Formats with Prettier (`format:check` only verifies)      |
| `npm run typecheck` | Type-checks the JavaScript through JSDoc (`tsc`, no emit) |
| `npm run check`     | Everything CI runs, in order                              |

## Where things live

Frontend code is in `apps/web`, backend code is in `apps/api`. The two small packages hold only what both sides share, or tooling.

```
apps/
  web/            Everything the browser runs: React pages, components, forms, the API client
    src/features/   one folder per feature (auth, masters, ...)
  api/            Everything the server runs: the REST API and the database
    src/            Express app; src/features/<feature>/ holds routes (controllers), service (rules), repository (queries)
    db/             Database models and SQL: prisma/schema.prisma (one model per legacy table),
                    sql/additive/ (tables the new system adds), sql/seed/ (test data), scripts/
    test/           API tests (unit, and integration against MySQL in Docker)
packages/
  shared/         Rules used by BOTH web and api: Zod validation schemas, permission names and
                  policies, error codes, money maths. Kept separate so the browser and the server
                  can never disagree, without copying code into each app.
  config/         ESLint and Prettier settings only (no app code).
scripts/          Developer scripts: copy the legacy database into Docker, quality checks
docs/             Architecture decisions (adr/), runbooks, deviations from the legacy system
```

Background jobs, when needed, will run from the API code too, as a second entry point (`apps/api/src/worker.js`) next to `server.js`.

See each part's README for details: [web](apps/web/README.md), [api](apps/api/README.md), [database](apps/api/db/README.md), [shared](packages/shared/README.md).

## Conventions

- **Plain JavaScript** (ES2022+, ES modules). No TypeScript files: types are written as JSDoc and checked with `tsc --noEmit` ([ADR 0002](docs/adr/0002-javascript-with-jsdoc-types.md)).
- **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`, `ci:`), enforced by commitlint.
- Staged files are linted and formatted on every commit (Husky + lint-staged).
- No `console.log` in committed code: use the structured logger.
- Every deviation from the legacy behaviour is documented in an ADR or in the pull request that makes it.
- Secrets live only in `.env` files, which are git-ignored. Database dumps and real data are never committed.

## Differences from the legacy system

See [docs/DEVIATIONS.md](docs/DEVIATIONS.md).

## Architecture decisions

See [docs/adr](docs/adr/README.md).

## Continuous integration

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on every pull request and on every push to `main`:

1. Lint, format check, typecheck, test and build (Node version from `.nvmrc`)
2. `npm audit` (fails on moderate or higher)
3. commitlint on the pull request's commits

Dependabot opens weekly grouped updates for npm packages and GitHub Actions.
