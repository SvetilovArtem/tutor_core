"""add_schedule_rule_students_table

Revision ID: 7cd6e357ab2a
Revises: 5a5480e14156
Create Date: 2026-08-13 16:30:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '7cd6e357ab2a'
down_revision = '5a5480e14156'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Создаём связующую таблицу
    op.create_table(
        'schedule_rule_students',
        sa.Column('rule_id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['rule_id'], ['schedule_rules.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('rule_id', 'student_id'),
    )

    # 2. Переносим данные из старой колонки student_id (если она существует)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('schedule_rules')]

    if 'student_id' in columns:
        # Копируем данные в связующую таблицу
        conn.execute(sa.text("""
            INSERT INTO schedule_rule_students (rule_id, student_id)
            SELECT id, student_id
            FROM schedule_rules
            WHERE student_id IS NOT NULL
        """))
        
        # Явно удаляем индекс на student_id, чтобы batch_alter_table не пытался его воссоздать
        indexes = [idx['name'] for idx in inspector.get_indexes('schedule_rules')]
        if 'ix_schedule_rules_student_id' in indexes:
            op.drop_index('ix_schedule_rules_student_id', table_name='schedule_rules')
            
        # Удаляем старую колонку
        with op.batch_alter_table('schedule_rules') as batch_op:
            batch_op.drop_column('student_id')


def downgrade() -> None:
    # Возвращаем колонку student_id
    with op.batch_alter_table('schedule_rules') as batch_op:
        batch_op.add_column(sa.Column('student_id', sa.Integer(), nullable=True))

    # Переносим данные обратно (только для правил с 1 учеником)
    conn = op.get_bind()
    conn.execute(sa.text("""
        UPDATE schedule_rules
        SET student_id = (
            SELECT student_id FROM schedule_rule_students
            WHERE schedule_rule_students.rule_id = schedule_rules.id
            LIMIT 1
        )
        WHERE id IN (
            SELECT rule_id FROM schedule_rule_students
            GROUP BY rule_id HAVING COUNT(*) = 1
        )
    """))

    op.drop_table('schedule_rule_students')