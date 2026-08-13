import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import Icon from './Icon';
import StatusBadge from './StatusBadge';
import type { Lesson } from '../api/lessons';
import styles from './DayDetailModal.module.css';

interface Props {
  date: Date;
  lessons: Lesson[];
  onClose: () => void;
  onLessonClick?: (lessonId: number) => void;
}

export default function DayDetailModal({ date, lessons, onClose, onLessonClick }: Props) {
  const sorted = [...lessons].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
  );

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {format(date, 'd MMMM yyyy, EEEE', { locale: ru })}
          </h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className={styles.summary}>
          Всего: <strong>{sorted.length}</strong>
          {' · '}Запланировано: <strong>{sorted.filter((l) => l.status === 'SCHEDULED').length}</strong>
          {' · '}Проведено: <strong>{sorted.filter((l) => l.status === 'COMPLETED').length}</strong>
          {' · '}Отменено: <strong>{sorted.filter((l) => l.status === 'CANCELLED').length}</strong>
        </div>

        {sorted.length === 0 ? (
          <div className={styles.empty}>Нет занятий в этот день</div>
        ) : (
          <div className={styles.lessonList}>
            {sorted.map((lesson) => (
              <div
                key={lesson.id}
                className={`${styles.lessonCard} ${onLessonClick ? styles.lessonCardClickable : ''}`}
                onClick={() => onLessonClick?.(lesson.id)}
                role={onLessonClick ? 'button' : undefined}
                tabIndex={onLessonClick ? 0 : undefined}
                onKeyDown={(e) => {
                  if (onLessonClick && (e.key === 'Enter' || e.key === ' ')) onLessonClick(lesson.id);
                }}
              >
                <div className={styles.lessonHeader}>
                  <span className={styles.time}>
                    {format(new Date(lesson.start_at), 'HH:mm')} – {format(new Date(lesson.end_at), 'HH:mm')}
                  </span>
                  <StatusBadge status={lesson.status} type="lesson" />
                </div>

                <div className={styles.detailRow}>
                  <span className={styles.fieldLabel}>Ученики:</span>
                  <div className={styles.studentChips}>
                    {lesson.students.length > 0 ? (
                      lesson.students.map((s) => (
                        <span key={s.student_id} className={styles.studentChipWrap}>
                          <span className={styles.studentChip}>{s.student_name}</span>
                          {s.status && s.status !== lesson.status && (
                            <StatusBadge status={s.status} type="student" className={styles.studentStatusBadge} />
                          )}
                        </span>
                      ))
                    ) : (
                      <span className={styles.noData}>Нет учеников</span>
                    )}
                  </div>
                </div>

                {lesson.homework_text && (
                  <div className={styles.detailRow}>
                    <span className={styles.fieldLabel}>ДЗ:</span>
                    <span className={styles.detailValue}>{lesson.homework_text}</span>
                  </div>
                )}

                {lesson.meeting_url && (
                  <div className={styles.detailRow}>
                    <span className={styles.fieldLabel}>Ссылка:</span>
                    <a
                      href={lesson.meeting_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.link}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Открыть встречу
                    </a>
                  </div>
                )}

                {lesson.tutor_notes && (
                  <div className={styles.detailRow}>
                    <span className={styles.fieldLabel}>Заметки:</span>
                    <span className={styles.detailValue}>{lesson.tutor_notes}</span>
                  </div>
                )}

                <div className={styles.editHint}>
                  <Icon name="chevronRight" size={12} /> Перейти к уроку
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}