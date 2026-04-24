"""audit_log: add ip_address and user_agent columns

Revision ID: 89042f7f5060
Revises: e6b08a202308
Create Date: 2026-04-24 15:00:39.568534

Promote the IP and User-Agent that `log_admin_action(request=...)` was
folding into `extra` into first-class typed columns:

- `ip_address` INET  (nullable) — Postgres INET validates format and
  supports GiST / inet_ops indexes if we later need range queries.
- `user_agent` TEXT  (nullable) — free-form string from the HTTP header.

Both nullable because admin actions may be invoked outside an HTTP
request (cron jobs, back-office scripts, tests).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "89042f7f5060"
down_revision: Union[str, None] = "e6b08a202308"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "audit_log",
        sa.Column("ip_address", postgresql.INET(), nullable=True),
    )
    op.add_column(
        "audit_log",
        sa.Column("user_agent", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("audit_log", "user_agent")
    op.drop_column("audit_log", "ip_address")
