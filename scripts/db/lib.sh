#!/usr/bin/env bash
# Shared helpers for the database scripts. Source it; do not run it directly.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCHEMA_FILE="${REPO_ROOT}/packages/db/sql/schema/legacy-schema.sql"
SEED_DIR="${REPO_ROOT}/packages/db/sql/seed"
ADDITIVE_DIR="${REPO_ROOT}/packages/db/sql/additive"
DUMP_DIR="${REPO_ROOT}/packages/db/dumps"

# Legacy table whose rows are scratch data rebuilt by stored procedures (about 20 GB).
# Its structure is copied, its rows are not.
SCRATCH_TABLE="stock_movement_working"

log() { printf '\033[1;34m[db]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[db] error:\033[0m %s\n' "$*" >&2; exit 1; }

load_env() {
  local env_file="${REPO_ROOT}/.env"
  [[ -f "${env_file}" ]] || die "Missing ${env_file}. Copy .env.example to .env and fill it in."
  # Values already exported in the shell win over .env, as with dotenv.
  local -a preset=()
  local name
  for name in $(compgen -e); do preset+=("${name}=${!name}"); done
  set -a
  # shellcheck disable=SC1090
  source "${env_file}"
  set +a
  local pair
  for pair in ${preset[@]+"${preset[@]}"}; do export "${pair?}"; done

  : "${LEGACY_DB_HOST:=127.0.0.1}"
  : "${LEGACY_DB_PORT:=3306}"
  : "${LEGACY_DB_NAME:=ihealthpharm}"
  : "${DEV_DB_NAME:=ihealthpharm}"
  : "${DEV_DB_TEST_NAME:=ihealthpharm_test}"
  : "${DEV_DB_PORT:=3307}"
  [[ -n "${LEGACY_DB_USER:-}" ]] || die "LEGACY_DB_USER is not set in .env"
  [[ -n "${DEV_DB_ROOT_PASSWORD:-}" ]] || die "DEV_DB_ROOT_PASSWORD is not set in .env"
}

# Reads from the legacy server. mysqldump only ever runs SELECT/SHOW statements there.
# The password goes through MYSQL_PWD so it never shows up in the process list.
legacy_dump() {
  MYSQL_PWD="${LEGACY_DB_PASSWORD:-}" mysqldump \
    --host="${LEGACY_DB_HOST}" --port="${LEGACY_DB_PORT}" --user="${LEGACY_DB_USER}" \
    --protocol=TCP \
    --single-transaction --quick --skip-lock-tables \
    --no-tablespaces --set-gtid-purged=OFF --column-statistics=0 \
    --default-character-set=utf8mb4 --hex-blob \
    "$@"
}

# Runs the mysql client as root inside the Docker container (never against the legacy server).
dev_mysql() {
  docker compose -f "${REPO_ROOT}/docker-compose.yml" exec -T -e MYSQL_PWD="${DEV_DB_ROOT_PASSWORD}" mysql \
    mysql --user=root --default-character-set=utf8mb4 "$@"
}

# Definers such as root@localhost or ihealthpharm@% do not exist in the Docker server.
# Removing them makes views, routines and triggers run as the user who restores them.
strip_definers() {
  sed -E 's/DEFINER=`[^`]+`@`[^`]+`//g'
}

require_docker_mysql() {
  command -v docker >/dev/null || die "Docker is not installed. See docs/runbooks/dev-database.md."
  docker info >/dev/null 2>&1 || die "Docker is not running. Start Docker Desktop."
  local status
  status="$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose -f "${REPO_ROOT}/docker-compose.yml" ps -q mysql 2>/dev/null)" 2>/dev/null || true)"
  [[ "${status}" == "healthy" ]] || die "The mysql container is not healthy (status: ${status:-not running}). Run 'npm run docker:up' first."
}

# Guard against ever pointing a write at the legacy server by mistake.
assert_target_is_not_legacy() {
  if [[ "${DEV_DB_PORT}" == "${LEGACY_DB_PORT}" ]]; then
    die "DEV_DB_PORT and LEGACY_DB_PORT are both ${DEV_DB_PORT}. The Docker database must use a different port."
  fi
}

# Creates the new system's own tables (ih_*) next to the legacy schema. Docker databases only.
apply_additive() {
  local database="$1" file
  for file in "${ADDITIVE_DIR}"/*.sql; do
    log "Applying $(basename "${file}") to ${database}"
    dev_mysql "${database}" <"${file}"
  done
}

progress() {
  if command -v pv >/dev/null; then pv -brt; else cat; fi
}
