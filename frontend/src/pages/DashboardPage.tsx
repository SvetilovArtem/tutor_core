import { useEffect, useState } from 'react';
import { format, isToday, isThisMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { tutorsApi, type Tutor } from '../api/tutors';
import { lessonsApi, type Lesson } from '../api/lessons';
import { studentsApi, type Student } from '../api/students';
import styles from './DashboardPage.module.css';

export default function DashboardPage() {
  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [showQuickLesson, setShowQuickLesson] = useState(false);
  const [quickStudentIds, setQuickStudentIds] = useState<number[]>([]);
  const [quickSubject, setQuickSubject] = useState('');
  const [quickDate, setQuickDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [quickTime, setQuickTime] = useState('10:00');
  const [quickDuration, setQuickDuration] = useState(60);
  const [quickNotes, setQuickNotes] = useState('');
  const [savingQuick, setSavingQuick] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      tutorsApi.getMe().then((r) => r.data),
      lessonsApi.list().then((r) => r.data.items), 
      studentsApi.list().then((r) => r.data.items), 
    ])
      .then(([t, l, s]) => {
        setTutor(t);
        setLessons(l);
        setStudents(s);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const upcoming = lessons
    .filter((l) => l.status === 'SCHEDULED')
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
    .slice(0, 5);

  const todayLessons = lessons.filter((l) => isToday(new Date(l.start_at)));
  const activeStudents = students.filter((s) => s.is_active).length;

  const incomeThisMonth = lessons
    .filter((l) => l.status === 'COMPLETED' && isThisMonth(new Date(l.start_at)))
    .reduce((sum, lesson) => {
      const lessonIncome = lesson.students.reduce((s, student) => s + (student.price_charged || 0), 0);
      return sum + lessonIncome;
    }, 0);

  const debtors = students
    .filter((s) => Number(s.balance) < 0)
    .sort((a, b) => Number(a.balance) - Number(b.balance))
    .slice(0, 5);

  const totalDebt = students.reduce((sum, s) => {
    const balance = Number(s.balance);
    return balance < 0 ? sum + Math.abs(balance) : sum;
  }, 0);

  const toggleQuickStudent = (id: number) => {
    setQuickStudentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreateQuickLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quickStudentIds.length === 0) {
      toast.error('Выберите хотя бы одного ученика');
      return;
    }

    setSavingQuick(true);
    try {
      const startAt = new Date(`${quickDate}T${quickTime}:00`).toISOString();
      await lessonsApi.createQuick({
        student_ids: quickStudentIds,
        subject: quickSubject || undefined,
        start_at: startAt,
        duration_minutes: quickDuration,
        notes: quickNotes || undefined,
      });
      toast.success('Разовый урок создан!');
      setShowQuickLesson(false);
      setQuickStudentIds([]);
      setQuickSubject('');
      setQuickDate(format(new Date(), 'yyyy-MM-dd'));
      setQuickTime('10:00');
      setQuickDuration(60);
      setQuickNotes('');
      loadData();
    } catch (err: any) {
      const errorDetail = err.response?.data?.detail;
      let errorMessage = 'Ошибка создания урока';
      if (typeof errorDetail === 'string') {
        errorMessage = errorDetail;
      } else if (Array.isArray(errorDetail) && errorDetail.length > 0) {
        errorMessage = errorDetail[0].msg || errorMessage;
      }
      toast.error(errorMessage);
    } finally {
      setSavingQuick(false);
    }
  };

  if (loading) return <div className={styles.loading}>Загрузка...</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.title}>👋 {tutor?.name}</h1>
            <p className={styles.subtitle}>{format(new Date(), "EEEE, d MMMM yyyy", { locale: ru })}</p>
          </div>
          <button className={styles.quickLessonBtn} onClick={() => setShowQuickLesson(true)}>
            + Разовый урок
          </button>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>📅</div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{todayLessons.length}</div>
            <div className={styles.statLabel}>Уроков сегодня</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>💰</div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{incomeThisMonth.toFixed(0)}</div>
            <div className={styles.statLabel}>Доход за месяц (BYN)</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>👥</div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{activeStudents}</div>
            <div className={styles.statLabel}>Активных учеников</div>
          </div>
        </div>
        <div className={`${styles.statCard} ${styles.clickable}`} onClick={() => navigate('/students')}>
          <div className={styles.statIcon} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>⚠️</div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{totalDebt.toFixed(0)}</div>
            <div className={styles.statLabel}>Задолженность (BYN)</div>
          </div>
        </div>
      </div>

      <div className={styles.contentGrid}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Ближайшие уроки</h2>
            <button className={styles.viewAllBtn} onClick={() => navigate('/schedule')}>Все уроки →</button>
          </div>
          {upcoming.length === 0 ? (
            <div className={styles.empty}>Нет запланированных уроков</div>
          ) : (
            <div className={styles.lessonList}>
              {upcoming.map((lesson) => (
                <div key={lesson.id} className={`${styles.lessonCard} ${styles.clickable}`} onClick={() => navigate(`/schedule?highlight=${lesson.id}`)}>
                  <div className={styles.lessonTime}>{format(new Date(lesson.start_at), 'dd MMM, HH:mm', { locale: ru })}</div>
                  <div className={styles.lessonStudents}>
                    {lesson.students.map((s) => (
                      <span key={s.student_id} className={styles.studentName}>{s.student_name}</span>
                    ))}
                  </div>
                  <div className={styles.lessonMeta}>
                    {lesson.subject && <span className={styles.subjectBadge}>{lesson.subject}</span>}
                    <span className={styles.duration}>
                      {Math.round((new Date(lesson.end_at).getTime() - new Date(lesson.start_at).getTime()) / 60000)} мин
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.rightColumn}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Должники</h2>
              <button className={styles.viewAllBtn} onClick={() => navigate('/students')}>Все →</button>
            </div>
            {debtors.length === 0 ? (
              <div className={styles.empty}>Все ученики оплатили! ✅</div>
            ) : (
              <div className={styles.debtorList}>
                {debtors.map((debtor) => (
                  <div key={debtor.id} className={`${styles.debtorItem} ${styles.clickable}`} onClick={() => navigate(`/students?highlight=${debtor.id}`)}>
                    <div className={styles.debtorInfo}>
                      <div className={styles.debtorName}>{debtor.name}</div>
                      {debtor.phone && <div className={styles.debtorPhone}>{debtor.phone}</div>}
                    </div>
                    <div className={styles.debtorBalance}>{Number(debtor.balance).toFixed(2)} BYN</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Мои предметы</h2>
            <div className={styles.subjectsList}>
              {tutor?.subjects.map((subject) => (
                <span key={subject} className={styles.subjectTag}>{subject}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showQuickLesson && (
        <div className={styles.modalOverlay} onClick={() => setShowQuickLesson(false)}>
          <form className={styles.modal} onSubmit={handleCreateQuickLesson} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>+ Разовый урок</h2>
            <p className={styles.modalHint}>Для внеплановых занятий, консультаций, замен</p>

            <div className={styles.formGroup}>
              <label className={styles.label}>Ученики *</label>
              <div className={styles.studentPicker}>
                {students.filter((s) => s.is_active).length === 0 ? (
                  <div className={styles.emptyHint}>Нет активных учеников</div>
                ) : (
                  students.filter((s) => s.is_active).map((student) => (
                    <label key={student.id} className={`${styles.studentChipPicker} ${quickStudentIds.includes(student.id) ? styles.studentChipActive : ''}`}>
                      <input type="checkbox" className={styles.hiddenCheckbox} checked={quickStudentIds.includes(student.id)} onChange={() => toggleQuickStudent(student.id)} />
                      {student.name}
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Предмет</label>
              <select className={styles.input} value={quickSubject} onChange={(e) => setQuickSubject(e.target.value)}>
                <option value="">Не указан</option>
                {tutor?.subjects.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Дата *</label>
                <input className={styles.input} type="date" value={quickDate} onChange={(e) => setQuickDate(e.target.value)} required />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Время *</label>
                <input className={styles.input} type="time" value={quickTime} onChange={(e) => setQuickTime(e.target.value)} required />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Длительность</label>
              <select className={styles.input} value={quickDuration} onChange={(e) => setQuickDuration(Number(e.target.value))}>
                <option value={30}>30 минут</option>
                <option value={45}>45 минут</option>
                <option value={60}>1 час</option>
                <option value={90}>1.5 часа</option>
                <option value={120}>2 часа</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Заметки</label>
              <textarea className={styles.textarea} value={quickNotes} onChange={(e) => setQuickNotes(e.target.value)} placeholder="Тема урока, особенности..." rows={2} />
            </div>

            <div className={styles.modalActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setShowQuickLesson(false)}>Отмена</button>
              <button type="submit" className={styles.submitBtn} disabled={savingQuick}>{savingQuick ? 'Создание...' : 'Создать урок'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}