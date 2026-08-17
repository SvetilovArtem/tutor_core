import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import Icon from '../components/Icon';
import { scheduleApi, type ScheduleRule, type ScheduleRuleUpdate } from '../api/schedules';
import { studentsApi, type Student } from '../api/students';
import { tutorsApi, type Tutor } from '../api/tutors';
import { lessonsApi, type Lesson } from '../api/lessons';
import DateRangeField from '../components/DateRangeField';
import ScheduleCalendar from '../components/ScheduleCalendar';
import DayDetailModal from '../components/DayDetailModal';
import styles from './SchedulePage.module.css';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

interface DayBlock {
  id: string;
  weekday: number;
  time: string;
  duration: string;
}

const createEmptyBlock = (): DayBlock => ({
  id: crypto.randomUUID(),
  weekday: 0,
  time: '16:00',
  duration: '60',
});

export default function SchedulePage() {
  const [rules, setRules] = useState<ScheduleRule[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formStudentIds, setFormStudentIds] = useState<number[]>([]);
  const [formGroupName, setFormGroupName] = useState('');
  const [formFrom, setFormFrom] = useState(new Date().toISOString().split('T')[0]);
  const [formTo, setFormTo] = useState<string | null>(null);
  const [dayBlocks, setDayBlocks] = useState<DayBlock[]>([createEmptyBlock()]);

  const [editingRule, setEditingRule] = useState<ScheduleRule | null>(null);
  const [editForm, setEditForm] = useState<{
    weekday: number;
    time: string;
    duration: number;
    student_ids: number[];
    group_name: string;
    effective_from: string;
    effective_to: string | null;
  }>({
    weekday: 0, time: '16:00', duration: 60,
    student_ids: [], group_name: '',
    effective_from: '', effective_to: null,
  });
  const [saving, setSaving] = useState(false);

  const [selectedDay, setSelectedDay] = useState<{ date: Date; lessons: Lesson[] } | null>(null);

  const [showGenModal, setShowGenModal] = useState(false);
  const [genFrom, setGenFrom] = useState(new Date().toISOString().split('T')[0]);
  const [genTo, setGenTo] = useState<string | null>(null);

  const [showCreateLesson, setShowCreateLesson] = useState(false);
  const [lessonStudentIds, setLessonStudentIds] = useState<number[]>([]);
  const [lessonSubject, setLessonSubject] = useState('');
  const [lessonDate, setLessonDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [lessonTime, setLessonTime] = useState('10:00');
  const [lessonDuration, setLessonDuration] = useState(60);
  const [lessonMeetingUrl, setLessonMeetingUrl] = useState('');
  const [lessonHomework, setLessonHomework] = useState('');
  const [savingLesson, setSavingLesson] = useState(false);

  const loadData = () => {
    const now = new Date();
    const date_from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const date_to = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().split('T')[0];

    Promise.all([
      scheduleApi.listRules(),
      studentsApi.list(),
      lessonsApi.list({
        date_from,
        date_to,
        limit: 1000, 
      }),
      tutorsApi.getMe(),
    ])
      .then(([r, s, l, t]) => {
        setRules(r.data.items);       
        setStudents(s.data.items);     
        setLessons(l.data.items);      
        setTutor(t.data);
      })
      .catch((err) => {
        console.error('Ошибка загрузки данных:', err);
        toast.error('Ошибка загрузки расписания');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const addBlock = () => setDayBlocks((prev) => [...prev, createEmptyBlock()]);
  
  const removeBlock = (id: string) => {
    if (dayBlocks.length === 1) return;
    setDayBlocks((prev) => prev.filter((b) => b.id !== id));
  };
  
  const updateBlock = (id: string, field: keyof DayBlock, value: string | number) => {
    setDayBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  };
  
  const resetCreateForm = () => {
    setFormStudentIds([]);
    setFormGroupName('');
    setFormFrom(new Date().toISOString().split('T')[0]);
    setFormTo(null);
    setDayBlocks([createEmptyBlock()]);
  };
  
  const toggleStudent = (id: number) => {
    setFormStudentIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };
  
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const promises = dayBlocks.map((block) =>
        scheduleApi.createRule({
          student_ids: formStudentIds,
          group_name: formGroupName.trim() || null,
          weekday: block.weekday,
          start_time: `${block.time}:00`,
          duration_minutes: Number(block.duration),
          effective_from: formFrom,
          effective_to: formTo || null,
        }),
      );
      await Promise.all(promises);
      toast.success(`Создано правил: ${dayBlocks.length}`);
      setShowCreateModal(false);
      resetCreateForm();
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка создания');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (rule: ScheduleRule) => {
    setEditingRule(rule);
    setEditForm({
      weekday: rule.weekday,
      time: rule.start_time.slice(0, 5),
      duration: rule.duration_minutes,
      student_ids: rule.students.map((s) => s.id),
      group_name: rule.group_name || '',
      effective_from: rule.effective_from,
      effective_to: rule.effective_to,
    });
  };
  
  const toggleEditStudent = (id: number) => {
    setEditForm((f) => ({
      ...f,
      student_ids: f.student_ids.includes(id) ? f.student_ids.filter((x) => x !== id) : [...f.student_ids, id],
    }));
  };
  
  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;
    setSaving(true);
    try {
      const payload: ScheduleRuleUpdate = {
        weekday: editForm.weekday,
        start_time: `${editForm.time}:00`,
        duration_minutes: editForm.duration,
        student_ids: editForm.student_ids,
        group_name: editForm.group_name.trim() || null,
        effective_from: editForm.effective_from,
        effective_to: editForm.effective_to,
      };
      await scheduleApi.updateRule(editingRule.id, payload);
      toast.success('Правило обновлено');
      setEditingRule(null);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка обновления');
    } finally {
      setSaving(false);
    }
  };

  const navigate = useNavigate();
  
  const handleLessonClick = (lessonId: number) => {
    setSelectedDay(null);
    navigate(`/lessons?highlight=${lessonId}`);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить правило расписания?')) return;
    try {
      await scheduleApi.deleteRule(id);
      toast.success('Правило удалено');
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch {
      toast.error('Ошибка удаления');
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genFrom) {
      toast.error('Укажите дату начала');
      return;
    }
    const finalGenTo = genTo || (() => {
      const d = new Date(genFrom);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return lastDay.toISOString().split('T')[0];
    })();

    setGenerating(true);
    try {
      const res = await scheduleApi.generate(genFrom, finalGenTo);
      toast.success(`Создано уроков: ${res.data.created}`);
      setShowGenModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка генерации');
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lessonStudentIds.length === 0) {
      toast.error('Выберите хотя бы одного ученика');
      return;
    }
    setSavingLesson(true);
    try {
      const startAt = format(new Date(`${lessonDate}T${lessonTime}:00`), "yyyy-MM-dd'T'HH:mm:ssXXX");
      await lessonsApi.create({
        start_at: startAt,
        duration_minutes: lessonDuration,
        subject: lessonSubject || undefined,
        students: lessonStudentIds.map(id => ({ student_id: id })),
        meeting_url: lessonMeetingUrl || undefined,
        homework_text: lessonHomework || undefined,
      });
      toast.success('Урок создан!');
      setShowCreateLesson(false);
      setLessonStudentIds([]);
      setLessonSubject('');
      setLessonDate(format(new Date(), 'yyyy-MM-dd'));
      setLessonTime('10:00');
      setLessonDuration(60);
      setLessonMeetingUrl('');
      setLessonHomework('');
      loadData();
    } catch (err: any) {
      const errorDetail = err.response?.data?.detail;
      let errorMessage = 'Ошибка создания урока';
      if (typeof errorDetail === 'string') errorMessage = errorDetail;
      else if (Array.isArray(errorDetail) && errorDetail.length > 0) errorMessage = errorDetail[0].msg;
      toast.error(errorMessage);
    } finally {
      setSavingLesson(false);
    }
  };

  const toggleLessonStudent = (id: number) => {
    setLessonStudentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const formatStudents = (rule: ScheduleRule) => {
    if (rule.students.length === 0) return rule.group_name || 'Групповое';
    if (rule.students.length === 1) return rule.students[0].name;
    return rule.group_name || `${rule.students.length} учеников`;
  };

  if (loading) return <div className={styles.empty}>Загрузка...</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Расписание</h1>
        <div className={styles.headerActions}>
          <button className={styles.addBtn} onClick={() => setShowCreateLesson(true)}>
            <Icon name="plus" size={18} /> Создать урок
          </button>
          <button className={styles.addBtn} onClick={() => setShowCreateModal(true)}>
            <Icon name="calendar" size={18} /> Новое правило
          </button>
          <button className={styles.generateBtn} onClick={() => setShowGenModal(true)}>
            <Icon name="refresh" size={18} /> Сгенерировать уроки
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
                <th>Ученики</th>
                <th>Период</th>
                <th className={styles.actionsHeader}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className={styles.weekdayCell}>{WEEKDAYS[r.weekday]}</td>
                  <td className={styles.timeCell}>{r.start_time.slice(0, 5)}</td>
                  <td>{r.duration_minutes} мин</td>
                  <td>
                    <div className={styles.studentsCell}>
                      {r.students.length > 0 ? (
                        r.students.map((s) => (
                          <span key={s.id} className={styles.studentChip}>{s.name}</span>
                        ))
                      ) : (
                        <span className={styles.groupLabel}>{r.group_name || 'Групповое'}</span>
                      )}
                    </div>
                  </td>
                  <td className={styles.periodCell}>
                    {r.effective_from}{r.effective_to ? ` → ${r.effective_to}` : ' → ∞'}
                  </td>
                  <td className={styles.actionsCell}>
                    <button className={styles.actionBtn} onClick={() => openEdit(r)} title="Редактировать">
                      <Icon name="edit" size={14} />
                    </button>
                    <button className={`${styles.actionBtn} ${styles.deleteActionBtn}`} onClick={() => handleDelete(r.id)} title="Удалить">
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Календарь занятий</h2>
        <ScheduleCalendar
          lessons={lessons}
          onDayClick={(date, dayLessons) => setSelectedDay({ date, lessons: dayLessons })}
          onLessonsChange={loadData}
        />
      </div>

      {showCreateLesson && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateLesson(false)}>
          <form className={styles.modal} onSubmit={handleCreateLesson} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>+ Создать урок</h2>
            <p className={styles.modalHint}>Одиночный урок вне правил расписания</p>

            <div className={styles.formGroup}>
              <label className={styles.label}>Ученики *</label>
              <div className={styles.studentPicker}>
                {students.filter((s) => s.is_active).length === 0 ? (
                  <div className={styles.emptyHint}>Нет активных учеников</div>
                ) : (
                  students.filter((s) => s.is_active).map((student) => (
                    <label key={student.id} className={`${styles.studentChipPicker} ${lessonStudentIds.includes(student.id) ? styles.studentChipActive : ''}`}>
                      <input type="checkbox" className={styles.hiddenCheckbox} checked={lessonStudentIds.includes(student.id)} onChange={() => toggleLessonStudent(student.id)} />
                      {student.name}
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Предмет</label>
              <select className={styles.input} value={lessonSubject} onChange={(e) => setLessonSubject(e.target.value)}>
                <option value="">Не указан</option>
                {tutor?.subjects.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
              <p className={styles.hint}>Если указан, цена возьмётся из карточки ученика для этого предмета</p>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Дата *</label>
                <input className={styles.input} type="date" value={lessonDate} onChange={(e) => setLessonDate(e.target.value)} required />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Время *</label>
                <input className={styles.input} type="time" value={lessonTime} onChange={(e) => setLessonTime(e.target.value)} required />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Длительность</label>
              <select className={styles.input} value={lessonDuration} onChange={(e) => setLessonDuration(Number(e.target.value))}>
                <option value={30}>30 минут</option>
                <option value={45}>45 минут</option>
                <option value={60}>1 час</option>
                <option value={90}>1.5 часа</option>
                <option value={120}>2 часа</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Ссылка на встречу</label>
              <input className={styles.input} type="url" value={lessonMeetingUrl} onChange={(e) => setLessonMeetingUrl(e.target.value)} placeholder="https://zoom.us/..." />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Домашнее задание</label>
              <textarea className={styles.textarea} value={lessonHomework} onChange={(e) => setLessonHomework(e.target.value)} placeholder="Задание на урок..." rows={2} />
            </div>

            <div className={styles.modalActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setShowCreateLesson(false)}>Отмена</button>
              <button type="submit" className={styles.submitBtn} disabled={savingLesson}>{savingLesson ? 'Создание...' : 'Создать урок'}</button>
            </div>
          </form>
        </div>
      )}

      {showCreateModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <form className={styles.modal} onSubmit={handleCreate} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Новое правило расписания</h2>

            <div className={styles.formGroup}>
              <label className={styles.label}>Ученики (выберите несколько для группового)</label>
              <div className={styles.studentPicker}>
                {students.map((s) => (
                  <label
                    key={s.id}
                    className={`${styles.studentChipPicker} ${formStudentIds.includes(s.id) ? styles.studentChipActive : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={formStudentIds.includes(s.id)}
                      onChange={() => toggleStudent(s.id)}
                      className={styles.hiddenCheckbox}
                    />
                    {s.name}
                  </label>
                ))}
                {students.length === 0 && <div className={styles.emptyHint}>Нет учеников. Создайте сначала.</div>}
              </div>
              <div className={styles.hint}>
                {formStudentIds.length === 0 && 'Групповое занятие (без привязки)'}
                {formStudentIds.length === 1 && 'Индивидуальное занятие'}
                {formStudentIds.length > 1 && `Групповое занятие (${formStudentIds.length} учеников)`}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Название группы (опционально)</label>
              <input
                className={styles.input}
                value={formGroupName}
                onChange={(e) => setFormGroupName(e.target.value)}
                placeholder="Например: Подготовка к ЕГЭ"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Период действия *</label>
              <DateRangeField
                startDate={formFrom}
                endDate={formTo}
                onChange={(start, end) => { setFormFrom(start); setFormTo(end); }}
              />
            </div>

            <div className={styles.divider}><span className={styles.dividerText}>Дни и время</span></div>

            <div className={styles.blocksList}>
              {dayBlocks.map((block, index) => (
                <div key={block.id} className={styles.dayBlock}>
                  <div className={styles.dayBlockHeader}>
                    <span className={styles.dayBlockNumber}>#{index + 1}</span>
                    {dayBlocks.length > 1 && (
                      <button type="button" className={styles.removeBlockBtn} onClick={() => removeBlock(block.id)}>
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                  </div>
                  <div className={styles.dayBlockFields}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>День *</label>
                      <select className={styles.input} value={block.weekday} onChange={(e) => updateBlock(block.id, 'weekday', Number(e.target.value))} required>
                        {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Время *</label>
                      <input className={styles.input} type="time" value={block.time} onChange={(e) => updateBlock(block.id, 'time', e.target.value)} required />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Мин</label>
                      <input className={styles.input} type="number" min="15" max="480" value={block.duration} onChange={(e) => updateBlock(block.id, 'duration', e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button type="button" className={styles.addBlockBtn} onClick={addBlock}>
              <Icon name="plus" size={16} /> Добавить ещё день
            </button>

            <div className={styles.modalActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setShowCreateModal(false)}>Отмена</button>
              <button type="submit" className={styles.submitBtn} disabled={creating}>
                {creating ? 'Создание...' : `Создать (${dayBlocks.length} дн.)`}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingRule && (
        <div className={styles.modalOverlay} onClick={() => setEditingRule(null)}>
          <form className={styles.modal} onSubmit={handleEditSave} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Редактировать правило</h2>

            <div className={styles.formGroup}>
              <label className={styles.label}>Ученики</label>
              <div className={styles.studentPicker}>
                {students.map((s) => (
                  <label
                    key={s.id}
                    className={`${styles.studentChipPicker} ${editForm.student_ids.includes(s.id) ? styles.studentChipActive : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={editForm.student_ids.includes(s.id)}
                      onChange={() => toggleEditStudent(s.id)}
                      className={styles.hiddenCheckbox}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
              <div className={styles.hint}>
                {editForm.student_ids.length === 0 && 'Групповое занятие'}
                {editForm.student_ids.length === 1 && 'Индивидуальное занятие'}
                {editForm.student_ids.length > 1 && `Групповое (${editForm.student_ids.length} учеников)`}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Название группы</label>
              <input
                className={styles.input}
                value={editForm.group_name}
                onChange={(e) => setEditForm((f) => ({ ...f, group_name: e.target.value }))}
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>День недели *</label>
                <select className={styles.input} value={editForm.weekday} onChange={(e) => setEditForm((f) => ({ ...f, weekday: Number(e.target.value) }))} required>
                  {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Время *</label>
                <input className={styles.input} type="time" value={editForm.time} onChange={(e) => setEditForm((f) => ({ ...f, time: e.target.value }))} required />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Длительность (мин)</label>
              <input className={styles.input} type="number" min="15" max="480" value={editForm.duration} onChange={(e) => setEditForm((f) => ({ ...f, duration: Number(e.target.value) }))} />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Период действия *</label>
              <DateRangeField
                startDate={editForm.effective_from}
                endDate={editForm.effective_to}
                onChange={(start, end) => setEditForm((f) => ({ ...f, effective_from: start, effective_to: end }))}
              />
            </div>

            <div className={styles.modalActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setEditingRule(null)}>Отмена</button>
              <button type="submit" className={styles.submitBtn} disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showGenModal && (
        <div className={styles.modalOverlay} onClick={() => setShowGenModal(false)}>
          <form className={styles.modal} onSubmit={handleGenerate} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Сгенерировать уроки</h2>
            
            <p className={styles.modalHint}>
              Уроки будут созданы на основе активных правил расписания, 
              с учётом исключений (SKIP/ADD). Дубликаты не создаются.
            </p>

            <div className={styles.formGroup}>
              <label className={styles.label}>Диапазон дат *</label>
              <DateRangeField
                startDate={genFrom}
                endDate={genTo}
                onChange={(start, end) => {
                  setGenFrom(start);
                  setGenTo(end);
                }}
              />
              <div className={styles.hint}>
                По умолчанию генерируется до конца месяца, если не указано иное.
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setShowGenModal(false)}
              >
                Отмена
              </button>
              <button type="submit" className={styles.submitBtn} disabled={generating}>
                {generating ? 'Генерация...' : 'Сгенерировать'}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedDay && (
        <DayDetailModal
          date={selectedDay.date}
          lessons={selectedDay.lessons}
          onClose={() => setSelectedDay(null)}
          onLessonClick={handleLessonClick}
        />
      )}
    </div>
  );
}