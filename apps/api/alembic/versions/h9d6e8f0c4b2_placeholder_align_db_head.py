"""placeholder: align DB head with code

The production DB recorded `h9d6e8f0c4b2` as its current alembic
revision, but no migration file with that ID exists in any commit
on any branch. A previous session most likely applied a migration
directly against the DB and the file was replaced before commit,
leaving Render in a crash loop on every boot
("Can't locate revision identified by 'h9d6e8f0c4b2'").

This file is an empty no-op that registers the phantom revision as
the head and points it at the real last migration. It performs no
DDL — it only restores chain integrity so alembic can resolve
`upgrade head` to a valid target.

Revision ID: h9d6e8f0c4b2
Revises: g8c5d7e9b3f1
Create Date: 2026-04-27 22:00:00.000000
"""

from typing import Sequence, Union


revision: str = "h9d6e8f0c4b2"
down_revision: Union[str, None] = "g8c5d7e9b3f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
