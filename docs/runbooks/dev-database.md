# Development database and services

Local development runs MySQL, Redis and Mailpit in Docker (`docker-compose.yml`).

| Service | Image         | Host port              | Purpose                                      |
| ------- | ------------- | ---------------------- | -------------------------------------------- |
| mysql   | `mysql:9.7.1` | 3307 (`DEV_DB_PORT`)   | Development and test databases               |
| redis   | `redis:8.6`   | 6379 (`REDIS_PORT`)    | Rate limiting, queues                        |
| mailpit | `mailpit`     | 1025 SMTP, 8025 web UI | Catches outgoing mail: http://localhost:8025 |

MySQL is the **same version as the legacy server (9.7.1)** and uses its `sql_mode`, character set, collation and time zone (`docker/mysql/conf.d/ihealth.cnf`).
It runs with `lower_case_table_names=1`, like the Windows production server. Every legacy table name is lower case, so nothing changes.
Port 3307 avoids clashing with the legacy server on 3306.

## Prerequisites

[Docker Desktop](https://www.docker.com/products/docker-desktop/), running. Give it at least 4 CPUs and 8 GB of memory (Settings -> Resources): the restore of the legacy database is memory-hungry.

## First run

```bash
cp .env.example .env          # then set DEV_DB_PASSWORD, DEV_DB_ROOT_PASSWORD and LEGACY_DB_USER/PASSWORD
npm run docker:up             # starts the services and waits until they are healthy
npm run db:copy               # copies the legacy database into Docker (asks first; --yes to skip)
npm run db:test:load          # builds the test database from the schema file and the synthetic seed
```

## The copy (`scripts/db/copy-dev-db.sh`)

- **The legacy database is only read.** `mysqldump` runs in a single consistent-snapshot transaction (`--single-transaction`, no table locks) and is the only thing that touches it. All writes go to the Docker server through `docker compose exec`. The script refuses to run if the Docker port equals the legacy port.
- Routines, triggers and events are included. `DEFINER` clauses are removed because the legacy users (`root@localhost`, `ihealthpharm@%`) do not exist in Docker.
- `stock_movement_working` holds scratch rows that reporting procedures rebuild (about 20 GB). Its **structure** is copied but its **rows** are not, which keeps the copy around 1.5 GB.
- `--keep-dump` also keeps a gzipped dump in `packages/db/dumps/` (git-ignored). Dumps hold real patient and business data: never commit or share them.
- `LEGACY_DB_PASSWORD` can be exported in the shell instead of written in `.env`.

## Local admin account

`npm run db:dev-admin` creates or refreshes `dev.admin` (email `dev.admin@localhost`) in the Docker development database. It gets every legacy permission and no two-factor sign-in. The password is `DEV_ADMIN_PASSWORD` in `.env`: if that is empty, a random one is generated and saved there. The script refuses to run against anything but the Docker database, and it is safe to run again (for example after `npm run db:copy`, which replaces the database).

## Shared test password

`npm run db:dev-test-passwords` lets every account in the Docker development database sign in to the new app with one password, `DEV_TEST_PASSWORD` from `.env` (generated and saved there if empty). Use any real username or work email from the copy. It stores an argon2id hash per account in `ih_employee_password` and switches off two-factor sign-in, in the Docker copy only. The legacy password and PIN columns are not changed or read out. `dev.admin` keeps its own password. Run it again after `npm run db:copy`.

## Test database (`ihealthpharm_test`)

- `packages/db/sql/schema/legacy-schema.sql` is the legacy schema with no data, AUTO_INCREMENT counters or definers. It is committed so tests and CI do not need the legacy server. To regenerate it, run `npm run db:schema:dump`.
- `packages/db/sql/seed/` is loaded in name order: `01-pharma-access.sql` (the legacy permission catalogue, which is reference data) and `02-test-data.sql` (a small, fully synthetic data set; test accounts are listed at the top of the file).
- To rebuild the test database: `npm run db:test:load`.

## Reset

```bash
docker compose down -v        # deletes the Docker volumes (Docker data only, never the legacy server)
```
