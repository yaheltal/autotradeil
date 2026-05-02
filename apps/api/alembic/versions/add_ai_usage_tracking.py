"""add AI usage tracking

Revision ID: i0a1b2c3d4e5
Revises: h9d6e8f0c4b2
"""
from alembic import op
import sqlalchemy as sa

revision = 'i0a1b2c3d4e5'
down_revision = 'h9d6e8f0c4b2'

def upgrade():
    op.add_column('dealers', sa.Column('ai_calls_this_month', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('dealers', sa.Column('ai_usage_reset_at', sa.DateTime(timezone=True), nullable=True))

def downgrade():
    op.drop_column('dealers', 'ai_usage_reset_at')
    op.drop_column('dealers', 'ai_calls_this_month')
