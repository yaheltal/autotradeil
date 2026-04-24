#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

PY="python3.11"
if ! command -v "$PY" >/dev/null 2>&1; then
  if [ -x "/usr/local/opt/python@3.11/bin/python3.11" ]; then
    PY="/usr/local/opt/python@3.11/bin/python3.11"
  else
    PY="python3"
  fi
fi

if [ ! -d "venv" ]; then
  echo "Creating virtualenv with $PY..."
  "$PY" -m venv venv
fi

# shellcheck disable=SC1091
source venv/bin/activate

pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
