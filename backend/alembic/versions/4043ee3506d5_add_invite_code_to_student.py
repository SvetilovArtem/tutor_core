"""add_invite_code_to_student

Revision ID: 4043ee3506d5
Revises: 70939836fd20
Create Date: 2026-08-18 ...
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '4043ee3506d5'
down_revision: Union[str, None] = '70939836fd20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:

    with op.batch_alter_table('students', schema=None) as batch_op:
        batch_op.add_column(sa.Column('invite_code', sa.String(length=20), nullable=True))
        batch_op.create_unique_constraint('uq_students_invite_code', ['invite_code'])


def downgrade() -> None:
    with op.batch_alter_table('students', schema=None) as batch_op:
        batch_op.drop_constraint('uq_students_invite_code', type_='unique')
        batch_op.drop_column('invite_code')