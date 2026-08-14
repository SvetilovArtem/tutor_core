"""add_cancellation_requests

Revision ID: 004_add_cancellation_requests
Revises: 7cd6e357ab2a  # Укажи здесь ID последней миграции из твоей папки versions
Create Date: 2026-08-14 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '004_add_cancellation_requests'
down_revision = '7cd6e357ab2a'  # Замени на ID твоей последней миграции (посмотри в папке versions)
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'cancellation_requests',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('lesson_id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='PENDING'),
        sa.Column('requested_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_by', sa.Integer(), nullable=True),
        sa.Column('tutor_comment', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['lesson_id'], ['lessons.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['resolved_by'], ['tutors.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_cancellation_requests_lesson_id', 'cancellation_requests', ['lesson_id'])
    op.create_index('ix_cancellation_requests_student_id', 'cancellation_requests', ['student_id'])


def downgrade() -> None:
    op.drop_index('ix_cancellation_requests_student_id', table_name='cancellation_requests')
    op.drop_index('ix_cancellation_requests_lesson_id', table_name='cancellation_requests')
    op.drop_table('cancellation_requests')