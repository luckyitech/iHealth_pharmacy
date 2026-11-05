#!/usr/bin/env bash
# Copies the local legacy database (read-only) into the Docker MySQL as the main development database.
#
#   scripts/db/copy-dev-db.sh [--yes] [--keep-dump]
#
#   --yes        do not ask before replacing the Docker development database
#   --keep-dump  also keep a gzipped copy of the dump in packages/db/dumps/ (git-ignored)
#
# The legacy server is only read: mysqldump runs one consistent-snapshot transaction (--single-transaction).
# Rows of stock_movement_working are skipped (scratch data, about 20 GB); its structure is copied.
source "$(dirname "$0")/lib.sh"

assume_yes=false
keep_dump=false
for arg in "$@"; do
  case "${arg}" in
    --yes) assume_yes=true ;;
    --keep-dump) keep_dump=true ;;
    *) die "Unknown option: ${arg}" ;;
  esac
done

load_env
assert_target_is_not_legacy
require_docker_mysql

if [[ "${assume_yes}" != true ]]; then
  read -r -p "Replace the Docker database '${DEV_DB_NAME}' with a copy of ${LEGACY_DB_HOST}:${LEGACY_DB_PORT}/${LEGACY_DB_NAME}? [y/N] " answer
  [[ "${answer}" =~ ^[Yy]$ ]] || die "Cancelled."
fi

log "Recreating Docker database '${DEV_DB_NAME}'"
dev_mysql -e "DROP DATABASE IF EXISTS \`${DEV_DB_NAME}\`;
  CREATE DATABASE \`${DEV_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  GRANT ALL PRIVILEGES ON \`${DEV_DB_NAME}\`.* TO '${DEV_DB_USER:-ihealth}'@'%';"

# The scratch table's structure goes first: views that reference it are created during the main restore.
dump_stream() {
  legacy_dump --no-data "${LEGACY_DB_NAME}" "${SCRATCH_TABLE}"
  legacy_dump --routines --triggers --events \
    --ignore-table="${LEGACY_DB_NAME}.${SCRATCH_TABLE}" "${LEGACY_DB_NAME}"
}

log "Copying ${LEGACY_DB_NAME} (this takes a while)"
started=${SECONDS}
if [[ "${keep_dump}" == true ]]; then
  mkdir -p "${DUMP_DIR}"
  dump_file="${DUMP_DIR}/${LEGACY_DB_NAME}-$(date +%Y%m%d-%H%M%S).sql.gz"
  dump_stream | strip_definers | progress | tee >(gzip -c >"${dump_file}") | dev_mysql "${DEV_DB_NAME}"
  log "Dump kept at ${dump_file}"
else
  dump_stream | strip_definers | progress | dev_mysql "${DEV_DB_NAME}"
fi

apply_additive "${DEV_DB_NAME}"

tables="$(dev_mysql -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DEV_DB_NAME}'")"
log "Done in $((SECONDS - started))s: ${tables} tables and views in Docker database '${DEV_DB_NAME}'"
