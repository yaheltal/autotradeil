"""add performance indexes

Revision ID: j1b2c3d4e5f6
Revises: i0a1b2c3d4e5
"""
from alembic import op

revision = 'j1b2c3d4e5f6'
down_revision = 'i0a1b2c3d4e5'

def upgrade():
    op.create_index('idx_inventory_dealer_status', 'inventory', ['dealer_id', 'status'])
    op.create_index('idx_offers_buyer_dealer_status', 'offers', ['buyer_dealer_id', 'status'])
    op.create_index('idx_offers_seller_dealer_status', 'offers', ['seller_dealer_id', 'status'])
    op.create_index('idx_notifications_dealer_read_at', 'notifications', ['dealer_id', 'read_at'])

def downgrade():
    op.drop_index('idx_notifications_dealer_read_at')
    op.drop_index('idx_offers_seller_dealer_status')
    op.drop_index('idx_offers_buyer_dealer_status')
    op.drop_index('idx_inventory_dealer_status')
