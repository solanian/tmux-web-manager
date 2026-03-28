#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RUN_DIR="${TMUX_FLEET_RUN_DIR:-/tmp/tmux-web-manager-supervised}"
MAIN_LOG="${TMUX_FLEET_MAIN_LOG:-$RUN_DIR/main.log}"
SUPERVISOR_LOG="${TMUX_FLEET_SUPERVISOR_LOG:-$RUN_DIR/supervisor.log}"
RESTART_DELAY="${TMUX_FLEET_RESTART_DELAY_SECONDS:-2}"

mkdir -p "$RUN_DIR"

while true; do
  printf '[%s] starting main service\n' "$(date --iso-8601=seconds)" >> "$SUPERVISOR_LOG"
  if node dist/index.js main >> "$MAIN_LOG" 2>&1; then
    printf '[%s] main service exited cleanly; restarting after %ss\n' "$(date --iso-8601=seconds)" "$RESTART_DELAY" >> "$SUPERVISOR_LOG"
  else
    EXIT_CODE=$?
    printf '[%s] main service exited with code %s; restarting after %ss\n' "$(date --iso-8601=seconds)" "$EXIT_CODE" "$RESTART_DELAY" >> "$SUPERVISOR_LOG"
  fi
  sleep "$RESTART_DELAY"
done
