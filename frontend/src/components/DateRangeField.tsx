import { useState } from 'react';
import { DateRange, type Range } from 'react-date-range';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import Icon from './Icon';
import styles from './DateRangeField.module.css';

// Стили библиотеки (обязательно)
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';

interface Props {
  startDate: string;
  endDate: string | null;
  onChange: (start: string, end: string | null) => void;
}

export default function DateRangeField({ startDate, endDate, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const range: Range = {
    startDate: new Date(startDate),
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
    const from = format(new Date(startDate), 'dd MMM yyyy', { locale: ru });
    if (!endDate) return `${from} → до конца месяца`;
    const to = format(new Date(endDate), 'dd MMM yyyy', { locale: ru });
    return `${from} — ${to}`;
  };

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="calendar" size={18} />
        <span>{displayText()}</span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} className={styles.chevron} />
      </button>

      {open && (
        <>
          <div className={styles.overlay} onClick={() => setOpen(false)} />
          <div className={styles.popover}>
            <DateRange
              ranges={[range]}
              onChange={handleSelect}
              locale={ru}
              months={2}
              direction="horizontal"
              showDateDisplay={false}
              minDate={new Date()}
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