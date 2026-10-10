"""AI assistant conversations: chat_conversations, chat_messages (data-model 1.6)

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_conversations",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_chat_conversations_user_id", "chat_conversations", ["user_id"])
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("conversation_id", sa.String(), sa.ForeignKey("chat_conversations.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("patient_id", sa.String(), sa.ForeignKey("patients.id"), nullable=True),
        sa.Column("meta", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_chat_messages_conversation_id", "chat_messages", ["conversation_id"])


def downgrade() -> None:
    op.drop_index("ix_chat_messages_conversation_id", table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_index("ix_chat_conversations_user_id", table_name="chat_conversations")
    op.drop_table("chat_conversations")
