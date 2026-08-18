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
import Pagination from '../components/Pagination';
import { lessonsApi, type Lesson } from '../api/lessons';
import { studentsApi, type Student } from '../api/students';
import styles from './LessonsPage.module.css';
import PaginationBar from '../components/PaginationBar';

const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'SCHEDULED', label: 'Запланирован' },
  { value: 'COMPLETED', label: 'Проведён' },
  { value: 'CANCELLED', label: 'Отменён' },
];

type SortField = 'start_at' | 'students' | 'status';
type SortOrder = 'asc' | 'desc';

interface SortConfig {
  field: SortField;
  order: SortOrder;
}


const STORAGE_KEY = 'lessons_pagination_state';

export default function LessonsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  const getInitialPagination = () => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const page = Number(parsed.page);
        const limit = Number(parsed.limit);
        if (page > 0 && limit > 0) return { page, limit };
      }
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    
    const urlPage = Number(searchParams.get('page'));
    const urlLimit = Number(searchParams.get('limit'));
    return {
      page: !isNaN(urlPage) && urlPage > 0 ? urlPage : 1,
      limit: !isNaN(urlLimit) && urlLimit > 0 ? urlLimit : 15,
    };
  };

  const initialPagination = getInitialPagination();
  const [currentPage, setCurrentPage] = useState(initialPagination.page);
  const [limit, setLimit] = useState(initialPagination.limit);
  const [totalPages, setTotalPages] = useState(1);

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

  const [sort, setSort] = useState<SortConfig>({ field: 'start_at', order: 'desc' });

  const syncPagination = (page: number, limitVal: number) => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ page, limit: limitVal }));
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      params.set('page', String(page));
      params.set('limit', String(limitVal));
      return params;
    }, { replace: true });
  };

  useEffect(() => {
    studentsApi.list().then((r) => setStudents(r.data.items)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    lessonsApi.list({
      page: currentPage,
      limit: limit,
      date_from: filterDateFrom || undefined,
      date_to: filterDateTo || undefined,
      status: filterStatus || undefined,
      student_ids: filterStudentIds.length ? filterStudentIds : undefined,
      sort_by: sort.field,
      sort_order: sort.order,
      include_cancelled: showCancelled,
    })
      .then((r) => {
        if (r.data.items.length === 0 && currentPage > 1) {
          setCurrentPage(1);
          syncPagination(1, limit);
          return;
        }
        setLessons(r.data.items);
        setTotalPages(r.data.total_pages);
      })
      .catch(() => toast.error('Ошибка загрузки уроков'))
      .finally(() => setLoading(false));
  }, [currentPage, limit, filterDateFrom, filterDateTo, filterStatus, filterStudentIds, showCancelled, sort]);

  useEffect(() => {
    if (!loading && highlightId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [loading, highlightId]);

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await lessonsApi.updateStatus(id, newStatus);
      toast.success('Статус обновлён');
      setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));
    } catch {
      toast.error('Ошибка обновления статуса');
    } finally {
      setOpenStatusId(null);
    }
  };

  const handleSort = (field: SortField) => {
  setCurrentPage(1);
  syncPagination(1, limit);
  setSort((prev) => ({
    field,
    order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc',
  }));
};

const SortIcon = ({ field }: { field: SortField }) => {
  if (sort.field !== field) return <span className={styles.sortIconPlaceholder}>↕</span>;
  return <span className={styles.sortIcon}>{sort.order === 'asc' ? '↑' : '↓'}</span>;
};

  const handleUploadAttachment = async (lessonId: number, file: File) => {
    const res = await lessonsApi.uploadAttachment(lessonId, file);
    setLessons((prev) =>
      prev.map((l) =>
        l.id === lessonId
          ? { ...l, homework_attachments: [...(l.homework_attachments || []), res.data] }
          : l
      )
    );
  };

  const handleDeleteAttachment = async (attachmentId: number, lessonId: number) => {
    await lessonsApi.deleteAttachment(attachmentId);
    setLessons((prev) =>
      prev.map((l) =>
        l.id === lessonId
          ? { ...l, homework_attachments: (l.homework_attachments || []).filter((a) => a.id !== attachmentId) }
          : l
      )
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
      const res = await lessonsApi.list({
        page: currentPage,
        limit: limit,
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
        status: filterStatus || undefined,
        student_ids: filterStudentIds.length ? filterStudentIds : undefined,
        include_cancelled: showCancelled
      });

      setLessons(res.data.items);
      setTotalPages(res.data.total_pages);
    } catch {
      toast.error('Ошибка восстановления');
    }
  };

  const openPaymentModal = (lesson: Lesson) => {
    setPaymentLesson(lesson);
    setPaymentStudentIds(lesson.students.filter((s) => !s.is_paid).map((s) => s.student_id));
    setPaymentAmount('');
    setPaymentComment(`Оплата за урок ${format(new Date(lesson.start_at), 'dd.MM.yyyy')}`);
  };

  const togglePaymentStudent = (studentId: number) => {
    setPaymentStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const handleLessonPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentLesson || !paymentAmount || paymentStudentIds.length === 0) return;
    setProcessingPayment(true);
    try {
      const amount = Number(paymentAmount);
      const comment = paymentComment || 'Оплата за урок';
      await lessonsApi.payLesson(paymentLesson.id, paymentStudentIds, amount, comment);
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
        })
      );
      
      setPaymentLesson(null);
      setPaymentStudentIds([]);
      setPaymentAmount('');
      setPaymentComment('');
    } catch (err: any) {
      const errorDetail = err.response?.data?.detail;
      let errorMessage = 'Ошибка оплаты';
      if (typeof errorDetail === 'string') errorMessage = errorDetail;
      else if (Array.isArray(errorDetail) && errorDetail.length > 0) errorMessage = errorDetail[0].msg;
      toast.error(errorMessage);
    } finally {
      setProcessingPayment(false);
    }
  };

  const hasActiveFilters = filterDateFrom || filterDateTo || filterStatus || filterStudentIds.length > 0;

  const resetFilters = () => {
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterStatus('');
    setFilterStudentIds([]);
    setCurrentPage(1);
    syncPagination(1, limit);
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
            onChange={(e) => {
              setShowCancelled(e.target.checked);
              setCurrentPage(1);
              syncPagination(1, limit);
            }}
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
              setCurrentPage(1);
              syncPagination(1, limit);
            }}
            compact
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Статус</label>
          <select
            className={styles.statusSelect}
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setCurrentPage(1);
              syncPagination(1, limit);
            }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Ученики</label>
          <StudentMultiSelect
            students={students}
            selectedIds={filterStudentIds}
            onChange={(ids) => {
              setFilterStudentIds(ids);
              setCurrentPage(1);
              syncPagination(1, limit);
            }}
            placeholder="Все ученики"
          />
        </div>

        {hasActiveFilters && (
          <button type="button" className={styles.resetBtn} onClick={resetFilters} title="Сбросить все фильтры">
            <Icon name="close" size={14} /> Сбросить
          </button>
        )}

        <div className={styles.filterCount}>
          Найдено: <strong>{lessons.length}</strong>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        {lessons.length === 0 ? (
          <div className={styles.empty}>
            {hasActiveFilters ? 'По выбранным фильтрам уроков не найдено' : showCancelled ? 'Нет уроков.' : 'Нет активных уроков. Создайте через расписание или вручную.'}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th onClick={() => handleSort('start_at')} className={styles.sortable}>
                  Дата и время <SortIcon field="start_at" />
                </th>
                <th onClick={() => handleSort('students')} className={styles.sortable}>
                  Ученики <SortIcon field="students" />
                </th>
                <th onClick={() => handleSort('status')} className={styles.sortable}>
                  Статус <SortIcon field="status" />
                </th>
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
                    className={`${isHighlighted ? styles.highlightedRow : ''} ${isCancelled ? styles.cancelledRow : ''}`}
                  >
                    <td className={styles.dateCell}>
                      {format(new Date(l.start_at), 'dd MMM yyyy, HH:mm', { locale: ru })}
                    </td>
                    <td>
                      <div className={styles.studentsList}>
                        {l.students.map((s) => (
                          <span key={s.student_id} className={`${styles.studentChip} ${s.is_paid ? styles.studentPaid : ''}`}>
                            {s.student_name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <button
                        ref={(el) => { if (openStatusId === l.id) setAnchorButton(el); }}
                        className={styles.statusBtn}
                        onClick={() => setOpenStatusId(openStatusId === l.id ? null : l.id)}
                      >
                        <StatusBadge status={l.status} type="lesson" />
                      </button>
                    </td>
                    <td>
                      <div className={styles.homeworkContent}>
                        {l.homework_text && <p className={styles.homeworkText}>{l.homework_text}</p>}
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
                        <button className={styles.restoreBtn} onClick={() => handleRestore(l.id)} title="Восстановить урок">
                          <Icon name="refresh" size={14} />
                        </button>
                      ) : isCompleted ? (
                        l.students.length === 0 ? (
                          <span className={styles.noStudents}>—</span>
                        ) : hasUnpaid ? (
                          <button className={styles.payBtn} onClick={() => openPaymentModal(l)} title="Есть неоплаченные ученики">
                            <Icon name="wallet" size={14} />
                          </button>
                        ) : (
                          <button className={styles.paidBtn} title="Все ученики оплатили">
                            <Icon name="check" size={14} />
                          </button>
                        )
                      ) : (
                        <button className={styles.deleteBtn} onClick={() => handleCancel(l.id)} title="Отменить урок">
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

      <PaginationBar
        visible={!loading && lessons.length > 0}
        currentPage={currentPage}
        totalPages={totalPages}
        limit={limit}
        limitOptions={[10, 15, 25, 50]}
        onPageChange={(page) => {
          setCurrentPage(page);
          syncPagination(page, limit);
        }}
        onLimitChange={(newLimit) => {
          setLimit(newLimit);
          setCurrentPage(1);
          syncPagination(1, newLimit);
        }}
      />

      {openStatusId !== null && (
        <StatusDropdownPortal
          anchorRef={anchorButton}
          currentStatus={lessons.find((l) => l.id === openStatusId)?.status || ''}
          onSelect={(newStatus) => {
            if (openStatusId !== null) handleStatusChange(openStatusId, newStatus);
          }}
          onClose={() => setOpenStatusId(null)}
        />
      )}

      {paymentLesson && (
        <div className={styles.modalOverlay} onClick={() => setPaymentLesson(null)}>
          <form className={styles.modal} onSubmit={handleLessonPayment} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Ученик оплатил урок</h2>
            <p className={styles.modalHint}>{format(new Date(paymentLesson.start_at), 'dd MMMM yyyy, HH:mm', { locale: ru })}</p>

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
              <input className={styles.input} type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required autoFocus />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Комментарий</label>
              <input className={styles.input} value={paymentComment} onChange={(e) => setPaymentComment(e.target.value)} placeholder="Наличные, перевод и т.д." />
            </div>

            {paymentStudentIds.length > 0 && paymentAmount && (
              <div className={styles.paymentSummary}>
                Итого: <strong>{(Number(paymentAmount) * paymentStudentIds.length).toFixed(2)} BYN</strong>
                <span className={styles.paymentSummaryHint}>({paymentStudentIds.length} × {Number(paymentAmount).toFixed(2)} BYN)</span>
              </div>
            )}

            <div className={styles.modalActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setPaymentLesson(null)}>Отмена</button>
              <button type="submit" className={styles.submitBtn} disabled={processingPayment || paymentStudentIds.length === 0}>
                {processingPayment ? 'Обработка...' : 'Зафиксировать оплату'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}