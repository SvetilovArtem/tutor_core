import { useState } from 'react';
import { DateRange, type Range } from 'react-date-range';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import Icon from './Icon';
import styles from './DateRangeField.module.css';

import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';

interface Props {
  startDate: string;
  endDate: string | null;
  onChange: (start: string, end: string | null) => void;
  compact?: boolean;
}

export default function DateRangeField({ startDate, endDate, onChange, compact }: Props) {
  const [open, setOpen] = useState(false);

  const range: Range = {
    startDate: startDate ? new Date(startDate) : new Date(),
    endDate: endDate ? new Date(endDate) : undefined,
    key: 'selection',
  };

  const handleSelect = (ranges: any) => {
    const sel = ranges.selection;
    const start = format(sel.startDate, 'yyyy-MM-dd');
    // Если выбран только один день или конец не определён — end = null
    const end = sel.endDate && sel.endDate.getTime() !== sel.startDate.getTime()
      ? format(sel.endDate, 'yyyy-MM-dd')
      : null;
    onChange(start, end);
  };

  const displayText = () => {
    if (!startDate) return 'Выберите период';
    const from = format(new Date(startDate), 'dd MMM yyyy', { locale: ru });
    if (!endDate) return `${from} → до конца месяца`;
    const to = format(new Date(endDate), 'dd MMM yyyy', { locale: ru });
    return `${from} — ${to}`;
  };

  return (
    <div className={`${styles.wrapper} ${compact ? styles.compact : ''}`}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="calendar" size={compact ? 14 : 18} />
        <span>{displayText()}</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={compact ? 12 : 16} className={styles.chevron} />
      </button>

      {open && (
        <>
          <div className={styles.overlay} onClick={() => setOpen(false)} />
          <div className={styles.popover}>
            <DateRange
              ranges={[range]}
              onChange={handleSelect}
              locale={ru}
              months={compact ? 1 : 2}
              direction="horizontal"
              showDateDisplay={false}
              minDate={new Date(2020, 0, 1)} // Разрешаем выбирать прошлые даты для фильтров
            />
            <div className={styles.popoverFooter}>
              <span className={styles.hint}>
                {!endDate && 'Конец не выбран → расписание до конца текущего месяца'}
              </span>
              <button type="button" className={styles.doneBtn} onClick={() => setOpen(false)}>
                Готово
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}