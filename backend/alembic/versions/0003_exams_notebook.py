"""exam_orders, exam_results, notebook_entries (data-model 1.4)

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('exam_orders',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('patient_id', sa.String(), sa.ForeignKey('patients.id'), nullable=False),
    sa.Column('appointment_id', sa.String(), sa.ForeignKey('appointments.id'), nullable=True),
    sa.Column('code', sa.String(), nullable=False),
    sa.Column('label', sa.String(), nullable=False),
    sa.Column('department', sa.String(), nullable=False),
    sa.Column('status', sa.String(), nullable=False),
    sa.Column('ai_suggested', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('human_confirmed_by', sa.String(), sa.ForeignKey('users.id'), nullable=True),
    sa.Column('ordered_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('done_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_exam_orders_patient_id', 'exam_orders', ['patient_id'])
    op.create_index('ix_exam_orders_appointment_id', 'exam_orders', ['appointment_id'])
    op.create_index('ix_exam_orders_department', 'exam_orders', ['department'])
    op.create_table('exam_results',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('exam_order_id', sa.String(), sa.ForeignKey('exam_orders.id'), nullable=False),
    sa.Column('patient_id', sa.String(), sa.ForeignKey('patients.id'), nullable=False),
    sa.Column('uploaded_by', sa.String(), sa.ForeignKey('users.id'), nullable=False),
    sa.Column('file_key', sa.String(), nullable=False),
    sa.Column('file_name', sa.String(), nullable=False),
    sa.Column('content_type', sa.String(), nullable=False),
    sa.Column('size_bytes', sa.Integer(), nullable=False),
    sa.Column('report_text', sa.Text(), server_default='', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_exam_results_exam_order_id', 'exam_results', ['exam_order_id'])
    op.create_index('ix_exam_results_patient_id', 'exam_results', ['patient_id'])
    op.create_table('notebook_entries',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('patient_id', sa.String(), sa.ForeignKey('patients.id'), nullable=False),
    sa.Column('user_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
    sa.Column('question', sa.Text(), nullable=False),
    sa.Column('ai_suggested', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('human_confirmed_by', sa.String(), sa.ForeignKey('users.id'), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_notebook_entries_patient_id', 'notebook_entries', ['patient_id'])


def downgrade() -> None:
    op.drop_table('notebook_entries')
    op.drop_table('exam_results')
    op.drop_table('exam_orders')
