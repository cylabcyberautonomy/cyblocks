#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export UV_PROJECT_ENVIRONMENT=.venv
uv sync
npm --prefix src/frontend install
