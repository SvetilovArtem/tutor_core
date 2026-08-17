import { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import * as dragAndDropModule from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, parse, startOfWeek, getDay } from 'date-fns'; // format уже есть
import { ru } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import styles from './ScheduleCalendar.module.css';
import toast from 'react-hot-toast';
import { lessonsApi, type Lesson } from '../api/lessons';

const withDragAndDrop = (dragAndDropModule as any).default || (dragAndDropModule as any).withDragAndDrop;
const DnDCalendar = withDragAndDrop(Calendar);

const locales = {
  'ru': ru,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

// НОВОЕ: Функция для корректного форматирования даты с часовым поясом
const toIsoWithTimezone = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm:ssXXX");

interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  status: string;
  lesson: Lesson;
}

interface Props {
  lessons: Lesson[];
  onDayClick?: (date: Date, dayLessons: Lesson[]) => void;
  onLessonsChange?: () => void;
}

export default function ScheduleCalendar({ lessons, onDayClick, onLessonsChange }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    const mapped = lessons.map((lesson) => {
      const studentNames = lesson.students.map((s) => s.student_name).join(', ');
      return {
        id: lesson.id,
        title: studentNames || 'Урок',
        start: new Date(lesson.start_at),
        end: new Date(lesson.end_at),
        status: lesson.status,
        lesson,
      };
    });
    setEvents(mapped);
  }, [lessons]);

  const handleEventDrop = async ({ event, start, end }: any) => {
    // 1. Мгновенно обновляем локально
    setEvents((prev) =>
      prev.map((e) =>
        e.id === event.id ? { ...e, start, end } : e
      )
    );

    // 2. Отправляем на бэкенд с правильным часовым поясом
    try {
      await lessonsApi.updateLessonTime(
        event.id,
        toIsoWithTimezone(start),  // ИСПРАВЛЕНО: используем format вместо toISOString
        toIsoWithTimezone(end)     // ИСПРАВЛЕНО: используем format вместо toISOString
      );
      toast.success('Время урока успешно обновлено');
      if (onLessonsChange) onLessonsChange();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка при переносе урока');
      // Откат при ошибке
      setEvents((prev) =>
        prev.map((e) =>
          e.id === event.id
            ? { ...e, start: new Date(event.lesson.start_at), end: new Date(event.lesson.end_at) }
            : e
        )
      );
    }
  };

  const handleEventResize = async ({ event, start, end }: any) => {
    // 1. Мгновенно обновляем локально
    setEvents((prev) =>
      prev.map((e) =>
        e.id === event.id ? { ...e, start, end } : e
      )
    );

    // 2. Отправляем на бэкенд с правильным часовым поясом
    try {
      await lessonsApi.updateLessonTime(
        event.id,
        toIsoWithTimezone(start),  // ИСПРАВЛЕНО
        toIsoWithTimezone(end)     // ИСПРАВЛЕНО
      );
      toast.success('Длительность урока обновлена');
      if (onLessonsChange) onLessonsChange();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка при изменении длительности');
      // Откат при ошибке
      setEvents((prev) =>
        prev.map((e) =>
          e.id === event.id
            ? { ...e, start: new Date(event.lesson.start_at), end: new Date(event.lesson.end_at) }
            : e
        )
      );
    }
  };

  const handleSelectSlot = ({ start }: any) => {
    if (onDayClick) {
      const dayLessons = lessons.filter(
        (l) => new Date(l.start_at).toDateString() === start.toDateString()
      );
      onDayClick(start, dayLessons);
    }
  };

  const eventPropGetter = (event: CalendarEvent) => {
    let className = styles.eventDefault;
    if (event.status === 'COMPLETED') className = styles.eventCompleted;
    if (event.status === 'CANCELLED') className = styles.eventCancelled;
    return { className };
  };

  return (
    <div className={styles.calendarContainer}>
      <DnDCalendar
        localizer={localizer}
        events={events}
        startAccessor={(event: any) => event.start}
        endAccessor={(event: any) => event.end}
        style={{ height: 600 }}
        defaultView={Views.WEEK}
        views={[Views.MONTH, Views.WEEK, Views.DAY]}
        messages={{
          next: 'След',
          previous: 'Пред',
          today: 'Сегодня',
          month: 'Месяц',
          week: 'Неделя',
          day: 'День',
        }}
        onEventDrop={handleEventDrop}
        onEventResize={handleEventResize}
        resizable
        onSelectSlot={handleSelectSlot}
        selectable
        eventPropGetter={eventPropGetter as any}
      />
    </div>
  );
}