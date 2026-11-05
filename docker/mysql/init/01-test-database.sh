#!/bin/bash
# Runs once, when the MySQL data directory is first initialised.
# Creates the empty test database (filled by scripts/db/load-test-schema.sh) and grants the app user access.
set -euo pipefail

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS \`${DEV_DB_TEST_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON \`${DEV_DB_TEST_NAME}\`.* TO '${MYSQL_USER}'@'%';
FLUSH PRIVILEGES;
SQL
