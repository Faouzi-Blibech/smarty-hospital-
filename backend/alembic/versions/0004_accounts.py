"""accounts: user status/lockout/approval, staff supervisor, access_codes, patient_access (data-model 1.5)

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-10
"""
from alembic import op
import sqlalchemy as sa

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('users', 'role', existing_type=sa.String(), nullable=True)
    op.add_column('users', sa.Column('status', sa.String(), server_default='active', nullable=False))
    op.add_column('users', sa.Column('failed_logins', sa.Integer(), server_default='0', nullable=False))
    op.add_column('users', sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('approved_by', sa.String(), sa.ForeignKey('users.id'), nullable=True))
    op.add_column('users', sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('requested_note', sa.String(), nullable=True))
    op.add_column('users', sa.Column('requested_doctor_id', sa.String(), sa.ForeignKey('users.id'), nullable=True))
    op.add_column('staff', sa.Column('supervisor_id', sa.String(), sa.ForeignKey('users.id'), nullable=True))
    op.create_table('access_codes',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('purpose', sa.String(), nullable=False),
    sa.Column('code_hash', sa.String(), nullable=False),
    sa.Column('patient_id', sa.String(), sa.ForeignKey('patients.id'), nullable=True),
    sa.Column('user_id', sa.String(), sa.ForeignKey('users.id'), nullable=True),
    sa.Column('issued_by', sa.String(), sa.ForeignKey('users.id'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('used_by', sa.String(), sa.ForeignKey('users.id'), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_access_codes_code_hash', 'access_codes', ['code_hash'])
    op.create_table('patient_access',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('patient_id', sa.String(), sa.ForeignKey('patients.id'), nullable=False),
    sa.Column('user_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
    sa.Column('granted_by', sa.String(), sa.ForeignKey('users.id'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_patient_access_patient_id', 'patient_access', ['patient_id'])
    op.create_index('ix_patient_access_user_id', 'patient_access', ['user_id'])


def downgrade() -> None:
    op.drop_table('patient_access')
    op.drop_table('access_codes')
    op.drop_column('staff', 'supervisor_id')
    for col in ('requested_doctor_id', 'requested_note', 'approved_at', 'approved_by', 'locked_until',
                'failed_logins', 'status'):
        op.drop_column('users', col)
    op.alter_column('users', 'role', existing_type=sa.String(), nullable=False)
