"""sign-up v2: users.requested_role (the role picked on the sign-up form)

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-10
"""
from alembic import op
import sqlalchemy as sa

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('requested_role', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'requested_role')
