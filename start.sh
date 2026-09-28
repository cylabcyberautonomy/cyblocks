#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export UV_PROJECT_ENVIRONMENT=.venv
uv run python -m backend.api &
api=$!
trap 'kill $api 2>/dev/null' EXIT
npm --prefix src/frontend run dev
