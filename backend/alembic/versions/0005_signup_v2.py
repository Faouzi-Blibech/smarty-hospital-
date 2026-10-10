"""sign-up v2: users.requested_role (the role picked on the sign-up form); enrollment codes removed; who disabled/rejected an account

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
    op.add_column('users', sa.Column('status_changed_by', sa.String(), sa.ForeignKey('users.id'), nullable=True))
    # enrollment codes no longer exist: drop the unredeemable rows and the column that linked them to a patient
    op.execute("DELETE FROM access_codes WHERE purpose = 'enrollment'")
    op.drop_column('access_codes', 'patient_id')


def downgrade() -> None:
    op.add_column('access_codes', sa.Column('patient_id', sa.String(), sa.ForeignKey('patients.id'), nullable=True))
    op.drop_column('users', 'status_changed_by')
    op.drop_column('users', 'requested_role')
