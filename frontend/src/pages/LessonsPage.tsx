import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import toast from 'react-hot-toast';
import Icon from '../components/Icon';
import StatusBadge from '../components/StatusBadge';
import HomeworkUploader from '../components/HomeworkUploader';
import StudentMultiSelect from '../components/StudentMultiSelect';
import DateRangeField from '../components/DateRangeField';
import StatusDropdownPortal from '../components/StatusDropdownPortal';
import { lessonsApi, type Lesson } from '../api/lessons';
import { studentsApi, type Student } from '../api/students';
import styles from './LessonsPage.module.css';

const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'SCHEDULED', label: 'Запланирован' },
  { value: 'COMPLETED', label: 'Проведён' },
  { value: 'CANCELLED', label: 'Отменён' },
];

export default function LessonsPage() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  const [anchorButton, setAnchorButton] = useState<HTMLButtonElement | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [openStatusId, setOpenStatusId] = useState<number | null>(null);
  const highlightedRef = useRef<HTMLTableRowElement>(null);

  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStudentIds, setFilterStudentIds] = useState<number[]>([]);
  const [showCancelled, setShowCancelled] = useState(false);

  const [paymentLesson, setPaymentLesson] = useState<Lesson | null>(null);
  const [paymentStudentIds, setPaymentStudentIds] = useState<number[]>([]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentComment, setPaymentComment] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);

  useEffect(() => {
    studentsApi.list().then((r) => setStudents(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    lessonsApi.list({
      date_from: filterDateFrom || undefined,
      date_to: filterDateTo || undefined,
      status: filterStatus || undefined,
      student_ids: filterStudentIds.length ? filterStudentIds : undefined,
    })
      .then((r) => {
        const filtered = showCancelled
          ? r.data
          : r.data.filter((l) => l.status !== 'CANCELLED');
        setLessons(filtered);
      })
      .catch(() => toast.error('Ошибка загрузки уроков'))
      .finally(() => setLoading(false));
  }, [filterDateFrom, filterDateTo, filterStatus, filterStudentIds, showCancelled]);

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

  const handleCancel = async (id: number) => {
    if (!confirm('Отменить урок? Урок останется в истории, но будет скрыт из списка.')) return;
    try {
      await lessonsApi.cancel(id);
      toast.success('Урок отменён');
      setLessons((prev) => prev.filter((l) => l.id !== id));
    } catch {
      toast.error('Ошибка отмены');
    }
  };

  const handleRestore = async (id: number) => {
    try {
      await lessonsApi.restore(id);
      toast.success('Урок восстановлен');
      setLessons((prev) => prev.filter((l) => l.id !== id));
    } catch {
      toast.error('Ошибка восстановления');
    }
  };

  const openPaymentModal = (lesson: Lesson) => {
    setPaymentLesson(lesson);
    setPaymentStudentIds(
      lesson.students.filter((s) => !s.is_paid).map((s) => s.student_id)
    );
    setPaymentAmount('');
    setPaymentComment(`Оплата за урок ${format(new Date(lesson.start_at), 'dd.MM.yyyy')}`);
  };

  const togglePaymentStudent = (studentId: number) => {
    setPaymentStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId],
    );
  };

  const handleLessonPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentLesson || !paymentAmount || paymentStudentIds.length === 0) return;
    setProcessingPayment(true);
    try {
      const amount = Number(paymentAmount);
      const comment = paymentComment || 'Оплата за урок';

      await lessonsApi.payLesson(
        paymentLesson.id,
        paymentStudentIds,
        amount,
        comment,
      );

      toast.success(`Оплата зафиксирована для ${paymentStudentIds.length} учеников`);
      
      setLessons((prev) =>
        prev.map((l) => {
          if (l.id !== paymentLesson.id) return l;
          return {
            ...l,
            students: l.students.map((s) => ({
              ...s,
              is_paid: paymentStudentIds.includes(s.student_id) ? true : s.is_paid,
            })),
          };
        }),
      );
      
      setPaymentLesson(null);
      setPaymentStudentIds([]);
      setPaymentAmount('');
      setPaymentComment('');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка оплаты');
    } finally {
      setProcessingPayment(false);
    }
  };

  const hasActiveFilters =
    filterDateFrom || filterDateTo || filterStatus || filterStudentIds.length > 0;

  const resetFilters = () => {
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterStatus('');
    setFilterStudentIds([]);
  };

  if (loading) return <div className={styles.empty}>Загрузка...</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Уроки</h1>
        <label className={styles.showCancelled}>
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
          />
          Показать отменённые
        </label>
      </div>

      <div className={styles.filtersPanel}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Период</label>
          <DateRangeField
            startDate={filterDateFrom}
            endDate={filterDateTo || null}
            onChange={(start, end) => {
              setFilterDateFrom(start);
              setFilterDateTo(end || '');
            }}
            compact
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Статус</label>
          <select
            className={styles.statusSelect}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Ученики</label>
          <StudentMultiSelect
            students={students}
            selectedIds={filterStudentIds}
            onChange={setFilterStudentIds}
            placeholder="Все ученики"
          />
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            className={styles.resetBtn}
            onClick={resetFilters}
            title="Сбросить все фильтры"
          >
            <Icon name="close" size={14} />
            Сбросить
          </button>
        )}

        <div className={styles.filterCount}>
          Найдено: <strong>{lessons.length}</strong>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        {lessons.length === 0 ? (
          <div className={styles.empty}>
            {hasActiveFilters
              ? 'По выбранным фильтрам уроков не найдено'
              : showCancelled
                ? 'Нет уроков.'
                : 'Нет активных уроков. Создайте через расписание или вручную.'}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Дата и время</th>
                <th>Ученики</th>
                <th>Статус</th>
                <th>Домашнее задание</th>
                <th className={styles.actionsHeader}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((l) => {
                const isHighlighted = String(l.id) === highlightId;
                const isCancelled = l.status === 'CANCELLED';
                const isCompleted = l.status === 'COMPLETED';
                const hasUnpaid = isCompleted && l.students.some((s) => !s.is_paid);
                
                return (
                  <tr
                    key={l.id}
                    ref={isHighlighted ? highlightedRef : undefined}
                    className={`${isHighlighted ? styles.highlightedRow : ''} ${
                      isCancelled ? styles.cancelledRow : ''
                    }`}
                  >
                    <td className={styles.dateCell}>
                      {format(new Date(l.start_at), 'dd MMM yyyy, HH:mm', { locale: ru })}
                    </td>
                    <td>
                      <div className={styles.studentsList}>
                        {l.students.map((s) => (
                          <span 
                            key={s.student_id} 
                            className={`${styles.studentChip} ${s.is_paid ? styles.studentPaid : ''}`}
                          >
                            {s.student_name}
                          </span>
                        ))}
                      </div>
                    </td>
                    
                    {/* ИСПРАВЛЕННАЯ ЯЧЕЙКА СТАТУСА: только кнопка с ref, без встроенного дропдауна */}
                    <td>
                      <button
                        ref={(el) => {
                          if (openStatusId === l.id) {
                            setAnchorButton(el);
                          }
                        }}
                        className={styles.statusBtn}
                        onClick={() => setOpenStatusId(openStatusId === l.id ? null : l.id)}
                      >
                        <StatusBadge status={l.status} type="lesson" />
                      </button>
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
                          readonly={isCancelled}
                        />
                      </div>
                    </td>
                    <td className={styles.actionsCell}>
                      {isCancelled ? (
                        <button
                          className={styles.restoreBtn}
                          onClick={() => handleRestore(l.id)}
                          title="Восстановить урок"
                        >
                          <Icon name="refresh" size={14} />
                        </button>
                      ) : isCompleted ? (
                        hasUnpaid ? (
                          <button
                            className={styles.payBtn}
                            onClick={() => openPaymentModal(l)}
                            title="Есть неоплаченные ученики"
                          >
                            <Icon name="wallet" size={14} />
                          </button>
                        ) : (
                          <button
                            className={styles.paidBtn}
                            title="Все ученики оплатили"
                            disabled
                          >
                            <Icon name="check" size={14} />
                          </button>
                        )
                      ) : (
                        <button
                          className={styles.deleteBtn}
                          onClick={() => handleCancel(l.id)}
                          title="Отменить урок"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ПОРТАЛ ДЛЯ ДРОПДАУНА (рендерится вне таблицы, в корне DOM) */}
      {openStatusId !== null && (
        <StatusDropdownPortal
          anchorRef={anchorButton}
          currentStatus={lessons.find((l) => l.id === openStatusId)?.status || ''}
          onSelect={(newStatus) => {
            if (openStatusId !== null) {
              handleStatusChange(openStatusId, newStatus);
            }
          }}
          onClose={() => setOpenStatusId(null)}
        />
      )}

      {/* МОДАЛКА ОПЛАТЫ */}
      {paymentLesson && (
        <div className={styles.modalOverlay} onClick={() => setPaymentLesson(null)}>
          <form
            className={styles.modal}
            onSubmit={handleLessonPayment}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.modalTitle}>Ученик оплатил урок</h2>
            <p className={styles.modalHint}>
              {format(new Date(paymentLesson.start_at), 'dd MMMM yyyy, HH:mm', { locale: ru })}
            </p>

            <div className={styles.formGroup}>
              <label className={styles.label}>Ученики, которые оплатили</label>
              <div className={styles.studentCheckboxes}>
                {paymentLesson.students.map((s) => (
                  <label key={s.student_id} className={styles.studentCheckbox}>
                    <input
                      type="checkbox"
                      checked={paymentStudentIds.includes(s.student_id)}
                      onChange={() => togglePaymentStudent(s.student_id)}
                      disabled={s.is_paid}
                    />
                    <span>{s.student_name} {s.is_paid && '(уже оплачен)'}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Сумма за каждого (BYN) *</label>
              <input
                className={styles.input}
                type="number"
                min="0.01"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Комментарий</label>
              <input
                className={styles.input}
                value={paymentComment}
                onChange={(e) => setPaymentComment(e.target.value)}
                placeholder="Наличные, перевод и т.д."
              />
            </div>

            {paymentStudentIds.length > 0 && paymentAmount && (
              <div className={styles.paymentSummary}>
                Итого: <strong>{(Number(paymentAmount) * paymentStudentIds.length).toFixed(2)} BYN</strong>
                <span className={styles.paymentSummaryHint}>
                  ({paymentStudentIds.length} × {Number(paymentAmount).toFixed(2)} BYN)
                </span>
              </div>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setPaymentLesson(null)}
              >
                Отмена
              </button>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={processingPayment || paymentStudentIds.length === 0}
              >
                {processingPayment ? 'Обработка...' : 'Зафиксировать оплату'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}