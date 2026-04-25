#!/usr/bin/env bash
# Render production boot script.
#
# Runs alembic migrations to head BEFORE starting the web process. This
# keeps schema changes synchronized with code on every deploy without
# requiring a separate manual step in the Render shell.
#
# Configure once in the Render dashboard:
#   Build command: pip install -r apps/api/requirements.txt
#   Start command: bash apps/api/scripts/start.sh
#
# Idempotent: alembic detects the current head and only applies the
# delta, so re-running on the same SHA is a no-op (~200ms overhead).
#
# If migrations fail, the script exits non-zero and Render keeps the
# previous deploy live — never deploy code that runs against a schema
# that wasn't successfully migrated.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "[boot] applying alembic migrations to head"
python -m alembic upgrade head

echo "[boot] starting uvicorn on 0.0.0.0:${PORT:-8000}"
exec python -m uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-1}" \
  --proxy-headers \
  --forwarded-allow-ips '*'
