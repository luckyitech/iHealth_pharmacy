#!/usr/bin/env bash
# Applies the additive SQL (new ih_* tables and rows) to the Docker dev copy. Every file is safe to
# run again, so this is what to run after pulling a change that adds one. Docker copy only.
source "$(dirname "$0")/lib.sh"

load_env
require_docker_mysql
apply_additive "${DEV_DB_NAME}"
log "Additive SQL applied to '${DEV_DB_NAME}'"
