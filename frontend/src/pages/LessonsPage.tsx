import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import toast from 'react-hot-toast';
import StatusBadge from '../components/StatusBadge';
import HomeworkUploader from '../components/HomeworkUploader';
import { lessonsApi, type Lesson } from '../api/lessons';
import styles from './LessonsPage.module.css';

const STATUS_OPTIONS = [
  { value: 'SCHEDULED', label: 'Запланирован' },
  { value: 'COMPLETED', label: 'Проведён' },
  { value: 'CANCELLED', label: 'Отменён' },
];

export default function LessonsPage() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [openStatusId, setOpenStatusId] = useState<number | null>(null);
  const highlightedRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    lessonsApi.list()
      .then((r) => setLessons(r.data))
      .catch(() => toast.error('Ошибка загрузки уроков'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && highlightId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [loading, highlightId]);

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await lessonsApi.updateStatus(id, newStatus);
      toast.success('Статус обновлён');
      setLessons((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)),
      );
    } catch {
      toast.error('Ошибка обновления статуса');
    } finally {
      setOpenStatusId(null);
    }
  };

  const handleUploadAttachment = async (lessonId: number, file: File) => {
    const res = await lessonsApi.uploadAttachment(lessonId, file);
    setLessons((prev) =>
      prev.map((l) =>
        l.id === lessonId
          ? { ...l, homework_attachments: [...(l.homework_attachments || []), res.data] }
          : l,
      ),
    );
  };

  const handleDeleteAttachment = async (attachmentId: number, lessonId: number) => {
    await lessonsApi.deleteAttachment(attachmentId);
    setLessons((prev) =>
      prev.map((l) =>
        l.id === lessonId
          ? {
              ...l,
              homework_attachments: (l.homework_attachments || []).filter(
                (a) => a.id !== attachmentId,
              ),
            }
          : l,
      ),
    );
  };

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
                const isHighlighted = String(l.id) === highlightId;
                return (
                  <tr
                    key={l.id}
                    ref={isHighlighted ? highlightedRef : undefined}
                    className={isHighlighted ? styles.highlightedRow : ''}
                  >
                    <td className={styles.dateCell}>
                      {format(new Date(l.start_at), 'dd MMM yyyy, HH:mm', { locale: ru })}
                    </td>
                    <td>
                      <div className={styles.studentsList}>
                        {l.students.map((s) => (
                          <span key={s.student_id} className={styles.studentChip}>
                            {s.student_name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className={styles.statusWrapper}>
                        <button
                          className={styles.statusBtn}
                          onClick={() => setOpenStatusId(openStatusId === l.id ? null : l.id)}
                        >
                          <StatusBadge status={l.status} type="lesson" />
                        </button>
                        {openStatusId === l.id && (
                          <>
                            <div
                              className={styles.statusOverlay}
                              onClick={() => setOpenStatusId(null)}
                            />
                            <div className={styles.statusDropdown}>
                              {STATUS_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  className={`${styles.statusOption} ${
                                    l.status === opt.value ? styles.statusOptionActive : ''
                                  }`}
                                  onClick={() => handleStatusChange(l.id, opt.value)}
                                >
                                  <StatusBadge status={opt.value} type="lesson" />
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className={styles.homeworkContent}>
                        {l.homework_text && (
                          <p className={styles.homeworkText}>{l.homework_text}</p>
                        )}
                        <HomeworkUploader
                          lessonId={l.id}
                          attachments={l.homework_attachments || []}
                          onUpload={handleUploadAttachment}
                          onDelete={(aid) => handleDeleteAttachment(aid, l.id)}
                        />
                      </div>
                    </td>
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