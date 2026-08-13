import { useState, useMemo } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday,
  addMonths, subMonths, isSameDay,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import Icon from './Icon';
import type { Lesson } from '../api/lessons';
import styles from './ScheduleCalendar.module.css';

interface Props {
  lessons: Lesson[];
  onDayClick: (date: Date, dayLessons: Lesson[]) => void;
}

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function ScheduleCalendar({ lessons, onDayClick }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  const getLessonsForDay = (day: Date) =>
    lessons.filter((l) => isSameDay(new Date(l.start_at), day));

  const prevMonth = () => setCurrentMonth((m) => subMonths(m, 1));
  const nextMonth = () => setCurrentMonth((m) => addMonths(m, 1));
  const goToToday = () => setCurrentMonth(new Date());

  return (
    <div className={styles.calendar}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.navBtn} onClick={prevMonth}>
          <Icon name="chevronLeft" size={20} />
        </button>
        <h2 className={styles.monthTitle}>
          {format(currentMonth, 'LLLL yyyy', { locale: ru })}
        </h2>
        <button className={styles.navBtn} onClick={nextMonth}>
          <Icon name="chevronRight" size={20} />
        </button>
        <button className={styles.todayBtn} onClick={goToToday}>Сегодня</button>
      </div>

      {/* Weekday labels */}
      <div className={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className={styles.weekdayLabel}>{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className={styles.daysGrid}>
        {calendarDays.map((day) => {
          const dayLessons = getLessonsForDay(day);
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);

          return (
            <div
              key={day.toISOString()}
              className={`${styles.dayCell} ${!inMonth ? styles.outsideMonth : ''} ${today ? styles.today : ''} ${dayLessons.length > 0 ? styles.hasLessons : ''}`}
              onClick={() => onDayClick(day, dayLessons)}
            >
              <span className={styles.dayNumber}>{format(day, 'd')}</span>
              {dayLessons.length > 0 && (
                <div className={styles.lessonDots}>
                  {dayLessons.slice(0, 4).map((l) => (
                    <div
                      key={l.id}
                      className={`${styles.lessonDot} ${styles[`status_${l.status.toLowerCase()}`] || ''}`}
                      title={`${format(new Date(l.start_at), 'HH:mm')} — ${l.students.map((s) => s.student_name).join(', ')}`}
                    />
                  ))}
                  {dayLessons.length > 4 && (
                    <span className={styles.moreCount}>+{dayLessons.length - 4}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}