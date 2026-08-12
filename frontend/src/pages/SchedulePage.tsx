import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '../components/Icon';
import api from '../api/client';
import { studentsApi, type Student } from '../api/students';
import styles from './SchedulePage.module.css';
import DateRangeField from '../components/DateRangeField';

interface ScheduleRule {
  id: number;
  student_id: number | null;
  group_name: string | null;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
}

interface DayBlock {
  id: string;
  weekday: number;
  time: string;
  duration: string;
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const createEmptyBlock = (): DayBlock => ({
  id: crypto.randomUUID(),
  weekday: 0,
  time: '16:00',
  duration: '60',
});

export default function SchedulePage() {
  const [rules, setRules] = useState<ScheduleRule[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);

  // Общая часть формы
  const [formStudentId, setFormStudentId] = useState('');
  const [formFrom, setFormFrom] = useState(new Date().toISOString().split('T')[0]);
  const [formTo, setFormTo] = useState('');

  // Динамические блоки дней
  const [dayBlocks, setDayBlocks] = useState<DayBlock[]>([createEmptyBlock()]);

  const loadData = () => {
    Promise.all([
      api.get<ScheduleRule[]>('/schedule/rules'),
      studentsApi.list(),
    ])
      .then(([r, s]) => { setRules(r.data); setStudents(s.data); })
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  // Управление блоками
  const addBlock = () => setDayBlocks((prev) => [...prev, createEmptyBlock()]);

  const removeBlock = (id: string) => {
    if (dayBlocks.length === 1) return;
    setDayBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const updateBlock = (id: string, field: keyof DayBlock, value: string | number) => {
    setDayBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)),
    );
  };

  const resetForm = () => {
    setFormStudentId('');
    setFormFrom(new Date().toISOString().split('T')[0]);
    setFormTo('');
    setDayBlocks([createEmptyBlock()]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const promises = dayBlocks.map((block) =>
        api.post('/schedule/rules', {
          student_id: formStudentId ? Number(formStudentId) : null,
          weekday: block.weekday,
          start_time: `${block.time}:00`,
          duration_minutes: Number(block.duration),
          effective_from: formFrom,
          effective_to: formTo || null,
        }),
      );
      await Promise.all(promises);
      toast.success(`Создано правил: ${dayBlocks.length}`);
      setShowModal(false);
      resetForm();
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка создания');
    } finally {
      setCreating(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const today = new Date();
      const end = new Date(today);
      end.setDate(end.getDate() + 30);
      const res = await api.post('/schedule/generate', {
        date_from: today.toISOString().split('T')[0],
        date_to: end.toISOString().split('T')[0],
      });
      toast.success(`Создано уроков: ${res.data.created}`);
    } catch { toast.error('Ошибка генерации'); }
    finally { setGenerating(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить правило расписания?')) return;
    try {
      await api.delete(`/schedule/rules/${id}`);
      toast.success('Правило удалено');
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch { toast.error('Ошибка удаления'); }
  };

  if (loading) return <div className={styles.empty}>Загрузка...</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Расписание</h1>
        <div className={styles.headerActions}>
          <button className={styles.addBtn} onClick={() => setShowModal(true)}>
            <Icon name="plus" size={18} /> Новое правило
          </button>
          <button className={styles.generateBtn} onClick={handleGenerate} disabled={generating}>
            <Icon name="calendar" size={18} />
            {generating ? 'Генерация...' : 'Сгенерировать на 30 дней'}
          </button>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        {rules.length === 0 ? (
          <div className={styles.empty}>Нет правил расписания. Создайте первое!</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>День</th>
                <th>Время</th>
                <th>Длительность</th>
                <th>Ученик / Группа</th>
                <th>Период</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className={styles.weekdayCell}>{WEEKDAYS[r.weekday]}</td>
                  <td className={styles.timeCell}>{r.start_time.slice(0, 5)}</td>
                  <td>{r.duration_minutes} мин</td>
                  <td>{r.group_name || students.find((s) => s.id === r.student_id)?.name || `#${r.student_id}`}</td>
                  <td className={styles.periodCell}>
                    с {r.effective_from}{r.effective_to ? ` по ${r.effective_to}` : ''}
                  </td>
                  <td>
                    <button className={styles.deleteBtn} onClick={() => handleDelete(r.id)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Модальное окно с динамическими блоками */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <form className={styles.modal} onSubmit={handleCreate} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Новое правило расписания</h2>

            {/* Ученик */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Ученик</label>
              <select className={styles.input} value={formStudentId} onChange={(e) => setFormStudentId(e.target.value)}>
                <option value="">Без привязки (групповое)</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Общий период действия */}
            <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Период действия *</label>
              <DateRangeField
                startDate={formFrom}
                endDate={formTo}
                onChange={(start, end) => {
                  setFormFrom(start);
                  setFormTo(end);
                }}
              />
            </div>
            </div>

            {/* Разделитель */}
            <div className={styles.divider}>
              <span className={styles.dividerText}>Дни и время</span>
            </div>

            {/* Динамические блоки */}
            <div className={styles.blocksList}>
              {dayBlocks.map((block, index) => (
                <div key={block.id} className={styles.dayBlock}>
                  <div className={styles.dayBlockHeader}>
                    <span className={styles.dayBlockNumber}>#{index + 1}</span>
                    {dayBlocks.length > 1 && (
                      <button
                        type="button"
                        className={styles.removeBlockBtn}
                        onClick={() => removeBlock(block.id)}
                        title="Удалить день"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                  </div>
                  <div className={styles.dayBlockFields}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>День *</label>
                      <select
                        className={styles.input}
                        value={block.weekday}
                        onChange={(e) => updateBlock(block.id, 'weekday', Number(e.target.value))}
                        required
                      >
                        {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Время *</label>
                      <input
                        className={styles.input}
                        type="time"
                        value={block.time}
                        onChange={(e) => updateBlock(block.id, 'time', e.target.value)}
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Мин</label>
                      <input
                        className={styles.input}
                        type="number"
                        min="15"
                        max="480"
                        value={block.duration}
                        onChange={(e) => updateBlock(block.id, 'duration', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button type="button" className={styles.addBlockBtn} onClick={addBlock}>
              <Icon name="plus" size={16} /> Добавить ещё день
            </button>

            <div className={styles.modalActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>Отмена</button>
              <button type="submit" className={styles.submitBtn} disabled={creating}>
                {creating ? 'Создание...' : `Создать (${dayBlocks.length} дн.)`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}