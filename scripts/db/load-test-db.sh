#!/usr/bin/env bash
# Rebuilds the Docker test database from the committed schema and the synthetic seed (no real data).
source "$(dirname "$0")/lib.sh"

load_env
require_docker_mysql
[[ -f "${SCHEMA_FILE}" ]] || die "Missing ${SCHEMA_FILE}. Run scripts/db/dump-test-schema.sh first."

log "Recreating Docker test database '${DEV_DB_TEST_NAME}'"
dev_mysql -e "DROP DATABASE IF EXISTS \`${DEV_DB_TEST_NAME}\`;
  CREATE DATABASE \`${DEV_DB_TEST_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  GRANT ALL PRIVILEGES ON \`${DEV_DB_TEST_NAME}\`.* TO '${DEV_DB_USER:-ihealth}'@'%';"

log "Loading schema"
dev_mysql "${DEV_DB_TEST_NAME}" <"${SCHEMA_FILE}"
apply_additive "${DEV_DB_TEST_NAME}"
for seed in "${SEED_DIR}"/*.sql; do
  log "Loading seed $(basename "${seed}")"
  dev_mysql "${DEV_DB_TEST_NAME}" <"${seed}"
done
log "Test database '${DEV_DB_TEST_NAME}' is ready"
