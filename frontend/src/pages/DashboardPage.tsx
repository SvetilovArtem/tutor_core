import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { tutorsApi, type Tutor } from '../api/tutors';
import { lessonsApi, type Lesson } from '../api/lessons';
import styles from './DashboardPage.module.css';

export default function DashboardPage() {
  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      tutorsApi.getMe().then((r) => r.data),
      lessonsApi.list().then((r) => r.data),
    ])
      .then(([t, l]) => {
        setTutor(t);
        setLessons(l);
      })
      .finally(() => setLoading(false));
  }, []);

  const upcoming = lessons
    .filter((l) => l.status === 'SCHEDULED')
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
    .slice(0, 5);

  const completedCount = lessons.filter((l) => l.status === 'COMPLETED').length;
  const scheduledCount = lessons.filter((l) => l.status === 'SCHEDULED').length;

  if (loading) return <div className={styles.loading}>Загрузка...</div>;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>👋 {tutor?.name}</h1>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{scheduledCount}</div>
          <div className={styles.statLabel}>Запланировано уроков</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{completedCount}</div>
          <div className={styles.statLabel}>Проведено уроков</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{tutor?.subjects.join(', ') || '—'}</div>
          <div className={styles.statLabel}>Предметы</div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Ближайшие уроки</h2>
        {upcoming.length === 0 ? (
          <div className={styles.empty}>Нет запланированных уроков</div>
        ) : (
          <div className={styles.lessonList}>
            {upcoming.map((lesson) => (
              <div key={lesson.id} className={styles.lessonCard}>
                <div className={styles.lessonTime}>
                  {format(new Date(lesson.start_at), 'dd MMM, HH:mm', { locale: ru })}
                </div>
                <div className={styles.lessonStudents}>
                  {lesson.students.map((s) => (
                    <span key={s.student_id} className={styles.studentName}>
                      {s.student_name}
                    </span>
                  ))}
                </div>
                <div className={styles.lessonStatus}>{lesson.status}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}