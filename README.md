# AutoTradeIL

Car trading platform for the Israeli market.

## Structure

```
autotradeil/
├── apps/
│   ├── web/          Next.js 14 frontend (App Router, TypeScript, Tailwind)
│   └── api/          FastAPI backend (Python 3.11+, SQLAlchemy)
└── packages/
    ├── shared/       Shared TypeScript types and utilities
    └── database/     Database schemas and migrations
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- Python 3.11+
- PostgreSQL 16+

## Development

### Web (Next.js)

```bash
pnpm install
pnpm dev:web
```

### API (FastAPI)

```bash
cd apps/api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: FastAPI, SQLAlchemy 2, Alembic
- **Database**: PostgreSQL (Supabase)
- **Deployment**: Vercel (web), Railway (api)
