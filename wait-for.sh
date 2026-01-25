#!/usr/bin/env bash
set -euo pipefail

# Simple wait helpers for local prod operations (no external deps).
# Usage:
#   source ./wait-for.sh
#   wait_for_tcp "localhost" 5432 "Postgres" 60

wait_for_tcp() {
  local host="$1"
  local port="$2"
  local name="${3:-$host:$port}"
  local timeout="${4:-60}"

  echo "[wait] $name ($host:$port) ... (timeout ${timeout}s)"
  local start_ts
  start_ts="$(date +%s)"

  while true; do
    # Bash TCP check (works on most distros)
    if timeout 1 bash -lc "</dev/tcp/${host}/${port}" >/dev/null 2>&1; then
      echo "[ok] $name is reachable"
      return 0
    fi
    local now
    now="$(date +%s)"
    if [ $((now - start_ts)) -ge "$timeout" ]; then
      echo "[err] Timeout waiting for $name"
      return 1
    fi
    sleep 1
  done
}
