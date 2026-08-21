"""make telegram_id nullable

Revision ID: 841616ae1d9b
Revises: f1afbd584d5a
Create Date: 2026-08-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '841616ae1d9b'
down_revision: Union[str, None] = 'f1afbd584d5a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
 
    with op.batch_alter_table('tutors', schema=None) as batch_op:
        batch_op.alter_column('telegram_id',
               existing_type=sa.INTEGER(),
               nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('tutors', schema=None) as batch_op:
        batch_op.alter_column('telegram_id',
               existing_type=sa.INTEGER(),
               nullable=False)