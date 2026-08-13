import styles from './StatusBadge.module.css';

type StatusType = 'lesson' | 'student' | 'activity' | 'payment';

interface StatusConfig {
  label: string;
  bgVar: string;
  textVar: string;
}

const STATUS_MAP: Record<string, Record<string, StatusConfig>> = {
  lesson: {
    SCHEDULED: { label: 'Запланирован', bgVar: '--status-scheduled-bg', textVar: '--status-scheduled-text' },
    COMPLETED: { label: 'Проведён', bgVar: '--status-completed-bg', textVar: '--status-completed-text' },
    CANCELLED: { label: 'Отменён', bgVar: '--status-cancelled-bg', textVar: '--status-cancelled-text' },
    IN_PROGRESS: { label: 'Идёт', bgVar: '--status-in-progress-bg', textVar: '--status-in-progress-text' },
  },
  student: {
    SCHEDULED: { label: 'Записан', bgVar: '--status-scheduled-bg', textVar: '--status-scheduled-text' },
    PRESENT: { label: 'Присутствует', bgVar: '--student-present-bg', textVar: '--student-present-text' },
    ABSENT: { label: 'Отсутствует', bgVar: '--student-absent-bg', textVar: '--student-absent-text' },
    LATE: { label: 'Опоздал', bgVar: '--student-late-bg', textVar: '--student-late-text' },
    EXCUSED: { label: 'Уважительная', bgVar: '--student-excused-bg', textVar: '--student-excused-text' },
    CANCELLED: { label: 'Отменено', bgVar: '--status-cancelled-bg', textVar: '--status-cancelled-text' },
  },
  activity: {
    true: { label: 'Активен', bgVar: '--active-bg', textVar: '--active-text' },
    false: { label: 'Неактивен', bgVar: '--inactive-bg', textVar: '--inactive-text' },
  },
  payment: {
    paid: { label: 'Оплачено', bgVar: '--payment-paid-bg', textVar: '--payment-paid-text' },
    pending: { label: 'Ожидает', bgVar: '--payment-pending-bg', textVar: '--payment-pending-text' },
    overdue: { label: 'Просрочено', bgVar: '--payment-overdue-bg', textVar: '--payment-overdue-text' },
  },
};

interface Props {
  status: string;
  type?: StatusType;
  className?: string;
}

export default function StatusBadge({ status, type = 'lesson', className }: Props) {
  const config = STATUS_MAP[type]?.[status] || {
    label: status,
    bgVar: '--inactive-bg',
    textVar: '--inactive-text',
  };

  return (
    <span
      className={`${styles.badge} ${className || ''}`}
      style={{
        backgroundColor: `var(${config.bgVar})`,
        color: `var(${config.textVar})`,
      }}
    >
      {config.label}
    </span>
  );
}