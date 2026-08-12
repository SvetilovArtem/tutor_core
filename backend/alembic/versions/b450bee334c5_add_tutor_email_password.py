"""add_tutor_email_password

Revision ID: b450bee334c5
Revises: 4a46e36ba048
Create Date: 2026-08-11 21:18:39.199768

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b450bee334c5'
down_revision: Union[str, None] = '4a46e36ba048'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:

    with op.batch_alter_table('tutors') as batch_op:
        batch_op.add_column(sa.Column('email', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('password_hash', sa.String(length=255), nullable=True))
        batch_op.create_unique_constraint('uq_tutors_email', ['email'])


def downgrade() -> None:
    with op.batch_alter_table('tutors') as batch_op:
        batch_op.drop_constraint('uq_tutors_email', type_='unique')
        batch_op.drop_column('password_hash')
        batch_op.drop_column('email')

    op.drop_constraint(None, 'tutors', type_='unique')
    op.drop_column('tutors', 'password_hash')
    op.drop_column('tutors', 'email')
    op.create_index('idx_transactions_student_created', 'transactions', ['student_id', 'created_at'], unique=False)
    op.create_index('idx_schedule_rules_tutor_active', 'schedule_rules', ['tutor_id', 'is_active', 'effective_from', 'effective_to'], unique=False)
    op.create_index('idx_schedule_exceptions_rule_date', 'schedule_exceptions', ['rule_id', 'date'], unique=False)
    op.create_index('idx_message_templates_tutor_type', 'message_templates', ['tutor_id', 'type'], unique=False)
    op.create_index('idx_lessons_start_status', 'lessons', ['start_at', 'status'], unique=False)
    op.create_index('idx_lesson_students_student', 'lesson_students', ['student_id', 'status'], unique=False)
    op.create_index('idx_balance_audit_student', 'balance_audit_log', ['student_id', 'created_at'], unique=False)

