import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { lessonsApi, type Lesson } from '../api/lessons';
import styles from './LessonsPage.module.css';

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  SCHEDULED: { label: 'Запланирован', className: 'statusScheduled' },
  COMPLETED: { label: 'Завершён', className: 'statusCompleted' },
  CANCELLED: { label: 'Отменён', className: 'statusCancelled' },
};

export default function LessonsPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    lessonsApi.list()
      .then((r) => setLessons(r.data))
      .catch(() => toast.error('Ошибка загрузки уроков'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className={styles.empty}>Загрузка...</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Уроки</h1>
      </div>

      <div className={styles.tableWrapper}>
        {lessons.length === 0 ? (
          <div className={styles.empty}>Нет уроков. Создайте через расписание или вручную.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Дата и время</th>
                <th>Ученики</th>
                <th>Статус</th>
                <th>Домашнее задание</th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((l) => {
                const statusInfo = STATUS_MAP[l.status] || { label: l.status, className: '' };
                return (
                  <tr key={l.id}>
                    <td className={styles.dateCell}>
                      {format(new Date(l.start_at), 'dd MMM yyyy, HH:mm', { locale: ru })}
                    </td>
                    <td>
                      <div className={styles.studentsList}>
                        {l.students.map((s) => (
                          <span key={s.student_id} className={styles.studentChip}>{s.student_name}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[statusInfo.className]}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className={styles.homeworkCell}>{l.homework_text || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}