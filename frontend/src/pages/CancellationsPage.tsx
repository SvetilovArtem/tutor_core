import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import toast from 'react-hot-toast';
import Icon from '../components/Icon';
import StatusBadge from '../components/StatusBadge';
import { cancellationsApi, type CancellationRequest } from '../api/cancellations';
import styles from './CancellationsPage.module.css';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Ожидает',
  APPROVED: 'Подтверждена',
  REJECTED: 'Отклонена',
};

export default function CancellationsPage() {
  const [requests, setRequests] = useState<CancellationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ id: number; approve: boolean } | null>(null);

  const loadData = () => {
    setLoading(true);
    cancellationsApi.list(filter)
      .then((r) => setRequests(r.data))
      .catch(() => toast.error('Ошибка загрузки запросов'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [filter]);

  const openResolveModal = (id: number, approve: boolean) => {
    setPendingAction({ id, approve });
    setComment('');
    setShowCommentModal(true);
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingAction) return;
    setResolvingId(pendingAction.id);
    try {
      await cancellationsApi.resolve(pendingAction.id, pendingAction.approve, comment || undefined);
      toast.success(pendingAction.approve ? 'Отмена подтверждена' : 'Запрос отклонён');
      setShowCommentModal(false);
      setPendingAction(null);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка обработки');
    } finally {
      setResolvingId(null);
    }
  };

  if (loading) return <div className={styles.empty}>Загрузка...</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Запросы на отмену</h1>
        <div className={styles.filters}>
          <button
            className={`${styles.filterBtn} ${!filter ? styles.filterActive : ''}`}
            onClick={() => setFilter(undefined)}
          >
            Все
          </button>
          <button
            className={`${styles.filterBtn} ${filter === 'PENDING' ? styles.filterActive : ''}`}
            onClick={() => setFilter('PENDING')}
          >
            Ожидают
          </button>
          <button
            className={`${styles.filterBtn} ${filter === 'APPROVED' ? styles.filterActive : ''}`}
            onClick={() => setFilter('APPROVED')}
          >
            Подтверждённые
          </button>
          <button
            className={`${styles.filterBtn} ${filter === 'REJECTED' ? styles.filterActive : ''}`}
            onClick={() => setFilter('REJECTED')}
          >
            Отклонённые
          </button>
        </div>
      </div>

      <div className={styles.list}>
        {requests.length === 0 ? (
          <div className={styles.empty}>Нет запросов на отмену</div>
        ) : (
          requests.map((req) => (
            <div key={req.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.studentInfo}>
                  <span className={styles.studentName}>{req.student_name || 'Неизвестный'}</span>
                  {req.lesson_start_at && (
                    <span className={styles.lessonDate}>
                      {format(new Date(req.lesson_start_at), 'dd MMM yyyy, HH:mm', { locale: ru })}
                    </span>
                  )}
                </div>
                <StatusBadge
                  status={req.status === 'PENDING' ? 'scheduled' : req.status === 'APPROVED' ? 'completed' : 'cancelled'}
                  type="lesson"
                />
              </div>

              {req.reason && (
                <div className={styles.reason}>
                  <span className={styles.reasonLabel}>Причина:</span>
                  <span className={styles.reasonText}>{req.reason}</span>
                </div>
              )}

              {req.tutor_comment && (
                <div className={styles.comment}>
                  <span className={styles.commentLabel}>Ваш комментарий:</span>
                  <span className={styles.commentText}>{req.tutor_comment}</span>
                </div>
              )}

              <div className={styles.cardFooter}>
                <span className={styles.requestedAt}>
                  Запрошено: {format(new Date(req.requested_at), 'dd MMM, HH:mm', { locale: ru })}
                </span>
                {req.status === 'PENDING' && (
                  <div className={styles.actions}>
                    <button
                      className={styles.approveBtn}
                      onClick={() => openResolveModal(req.id, true)}
                      disabled={resolvingId === req.id}
                    >
                      <Icon name="check" size={14} /> Подтвердить отмену
                    </button>
                    <button
                      className={styles.rejectBtn}
                      onClick={() => openResolveModal(req.id, false)}
                      disabled={resolvingId === req.id}
                    >
                      <Icon name="close" size={14} /> Отклонить
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Модалка с комментарием */}
      {showCommentModal && pendingAction && (
        <div className={styles.modalOverlay} onClick={() => setShowCommentModal(false)}>
          <form className={styles.modal} onSubmit={handleResolve} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>
              {pendingAction.approve ? 'Подтвердить отмену?' : 'Отклонить запрос?'}
            </h2>
            <p className={styles.modalHint}>
              {pendingAction.approve
                ? 'Урок будет отменён, баланс ученика не изменится.'
                : 'Урок останется в расписании, ученик получит уведомление.'}
            </p>
            <div className={styles.formGroup}>
              <label className={styles.label}>Комментарий (опционально)</label>
              <textarea
                className={styles.textarea}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Например: Перенесём на следующую неделю"
                rows={3}
              />
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setShowCommentModal(false)}>
                Отмена
              </button>
              <button
                type="submit"
                className={pendingAction.approve ? styles.submitBtn : styles.rejectSubmitBtn}
                disabled={resolvingId === pendingAction.id}
              >
                {resolvingId === pendingAction.id
                  ? 'Обработка...'
                  : pendingAction.approve
                    ? 'Подтвердить'
                    : 'Отклонить'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}