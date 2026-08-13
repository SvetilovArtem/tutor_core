"""add_homework_attachments

Revision ID: 5a5480e14156
Revises: db042377553c
Create Date: 2026-08-13 15:45:14.711573

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '5a5480e14156'
down_revision: Union[str, None] = 'db042377553c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'homework_attachments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('lesson_id', sa.Integer(), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('original_name', sa.String(length=255), nullable=False),
        sa.Column('file_path', sa.String(length=500), nullable=False),
        sa.Column('mime_type', sa.String(length=100), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['lesson_id'], ['lessons.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_homework_attachments_lesson_id', 'homework_attachments', ['lesson_id'])


def downgrade() -> None:
    op.drop_index('ix_homework_attachments_lesson_id', table_name='homework_attachments')
    op.drop_table('homework_attachments')