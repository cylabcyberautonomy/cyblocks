#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IDE_JSON="$ROOT/backend/examples/three-host-http.ide.json"
INTERMEDIATE_JSON="$ROOT/backend/generated/three-host-http.intermediate.json"
EXAMPLE_DOCKER_CONFIG="$ROOT/backend/runs/docker-config"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export DOCKER_CONFIG="${DOCKER_CONFIG:-$EXAMPLE_DOCKER_CONFIG}"
if [[ -z "${DOCKER_HOST:-}" && -z "${DOCKER_CONTEXT:-}" ]]; then
  export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
fi

mkdir -p "$DOCKER_CONFIG"
if [[ ! -f "$DOCKER_CONFIG/config.json" ]]; then
  printf '{ "auths": {} }\n' > "$DOCKER_CONFIG/config.json"
fi

python3 "$ROOT/backend/scripts/compile_ide_to_intermediate.py" \
  "$IDE_JSON" \
  --out "$INTERMEDIATE_JSON" \
  --name three-host-http

python3 "$ROOT/backend/scripts/deploy_docker.py" \
  "$INTERMEDIATE_JSON" \
  --replace

python3 "$ROOT/backend/scripts/status_docker.py" \
  "$INTERMEDIATE_JSON"
