# @autotradeil/api

FastAPI backend for AutoTradeIL.

## Run (dev)

```bash
./scripts/dev.sh
```

This creates a `venv/`, installs `requirements.txt`, and runs `uvicorn` with hot reload on port 8000.

## Endpoints

- `GET /` — service metadata
- `GET /health` — liveness check

## Stack

- FastAPI 0.115
- SQLAlchemy 2 (async, asyncpg)
- Alembic (migrations)
- Pydantic v2 + pydantic-settings
