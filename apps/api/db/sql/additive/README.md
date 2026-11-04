# Additive SQL

Tables the new system adds next to the legacy schema: refresh tokens, upgraded password hashes, role permissions and the audit log.
Rules ([ADR 0003](../../../../docs/adr/0003-keep-legacy-database-schema.md)):

- Files are applied in name order (`NNNN-description.sql`) and must be idempotent (`CREATE TABLE IF NOT EXISTS`).
- They never alter or drop legacy tables or columns.
- No real data.
