import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import Icon from '../components/Icon';
import StatusBadge from '../components/StatusBadge';
import { studentsApi, type Student, type StudentCreate, type StudentsListParams } from '../api/students';
import { tutorsApi } from '../api/tutors';
import styles from './StudentsPage.module.css';

type SortField = 'name' | 'created_at';
type SortOrder = 'asc' | 'desc';

interface SortConfig {
  field: SortField;
  order: SortOrder;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [tutorSubjects, setTutorSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterActive, setFilterActive] = useState<boolean | ''>('');
  const [sort, setSort] = useState<SortConfig>({ field: 'name', order: 'asc' });

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formSubjects, setFormSubjects] = useState<string[]>([]);

  const loadStudents = useCallback(() => {
    setLoading(true);
    const params: StudentsListParams = {};
    if (search.trim()) params.search = search.trim();
    if (filterSubject) params.subject = filterSubject;
    if (filterActive !== '') params.is_active = filterActive === true;
    params.sort_by = sort.field;
    params.sort_order = sort.order;

    studentsApi.list(params)
      .then((r) => setStudents(r.data))
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [search, filterSubject, filterActive, sort]);

  useEffect(() => {
    tutorsApi.getMe().then((r) => setTutorSubjects(r.data.subjects || [])).catch(() => {});
  }, []);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  useEffect(() => {
    const timer = setTimeout(() => loadStudents(), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSort = (field: SortField) => {
    setSort((prev) => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sort.field !== field) return <span className={styles.sortIconPlaceholder}>↕</span>;
    return <span className={styles.sortIcon}>{sort.order === 'asc' ? '↑' : '↓'}</span>;
  };

  const resetForm = () => {
    setFormName(''); setFormPhone(''); setFormNotes(''); setFormSubjects([]); setEditingId(null);
  };

  const openCreate = () => { resetForm(); setShowModal(true); };
  const openEdit = (s: Student) => {
    setFormName(s.name); setFormPhone(s.phone || ''); setFormNotes(s.notes || '');
    setFormSubjects([...s.subjects]); setEditingId(s.id); setShowModal(true);
  };

  const toggleSubject = (subj: string) => {
    setFormSubjects((prev) => prev.includes(subj) ? prev.filter((s) => s !== subj) : [...prev, subj]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);
    const payload: StudentCreate = {
      name: formName.trim(),
      phone: formPhone.trim() || undefined,
      notes: formNotes.trim() || undefined,
      subjects: formSubjects,
    };
    try {
      if (editingId) {
        await studentsApi.update(editingId, payload);
        toast.success('Ученик обновлён');
      } else {
        await studentsApi.create(payload);
        toast.success('Ученик создан');
      }
      setShowModal(false); resetForm(); loadStudents();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка сохранения');
    } finally { setSaving(false); }
  };

  const handleToggleActive = async (id: number, name: string, currentActive: boolean) => {
    const action = currentActive ? 'деактивировать' : 'активировать';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ученика «${name}»?`)) return;
    try {
      await studentsApi.toggleActive(id);
      toast.success(`Ученик ${currentActive ? 'деактивирован' : 'активирован'}`);
      loadStudents();
    } catch { toast.error('Ошибка'); }
  };

  const handleRemindPayment = async (id: number, name: string) => {
    if (!confirm(`Отправить напоминание об оплате ученику «${name}»?`)) return;
    try {
      await studentsApi.remindPayment(id);
      toast.success('Напоминание отправлено');
    } catch { toast.error('Ошибка отправки'); }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Удалить ученика «${name}» навсегда? Это действие необратимо.`)) return;
    try {
      await studentsApi.delete(id);
      toast.success('Ученик удалён');
      setStudents((prev) => prev.filter((s) => s.id !== id));
    } catch { toast.error('Ошибка удаления'); }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Ученики</h1>
        <button className={styles.addBtn} onClick={openCreate}>
          <Icon name="plus" size={18} /> Добавить
        </button>
      </div>

      <div className={styles.filters}>
        <div className={styles.searchWrapper}>
          <Icon name="search" size={18} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Поиск по имени или телефону..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className={styles.filterSelect} value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
          <option value="">Все предметы</option>
          {tutorSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={styles.filterSelect} value={String(filterActive)} onChange={(e) => setFilterActive(e.target.value === '' ? '' : e.target.value === 'true')}>
          <option value="">Все статусы</option>
          <option value="true">Активные</option>
          <option value="false">Неактивные</option>
        </select>
      </div>

      <div className={styles.tableWrapper}>
        {loading ? (
          <div className={styles.empty}>Загрузка...</div>
        ) : students.length === 0 ? (
          <div className={styles.empty}>Нет учеников по заданным фильтрам</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.sortableTh} onClick={() => handleSort('name')}>
                  Имя <SortIcon field="name" />
                </th>
                <th>Телефон</th>
                <th>Предметы</th>
                <th>Статус</th>
                <th>Заметки</th>
                <th className={styles.actionsHeader}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className={!s.is_active ? styles.inactiveRow : ''}>
                  <td className={styles.nameCell}>{s.name}</td>
                  <td className={styles.phoneCell}>{s.phone || '—'}</td>
                  <td>
                    <div className={styles.subjectTags}>
                      {s.subjects.length > 0
                        ? s.subjects.map((subj) => <span key={subj} className={styles.subjectTag}>{subj}</span>)
                        : <span className={styles.noData}>—</span>}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={String(s.is_active)} type="activity" />
                  </td>
                  <td className={styles.notesCell}>{s.notes || '—'}</td>
                  <td className={styles.actionsCell}>
                    <button className={styles.actionBtn} onClick={() => openEdit(s)} title="Редактировать">
                      <Icon name="edit" size={14} />
                    </button>
                    <button className={styles.actionBtn} onClick={() => handleRemindPayment(s.id, s.name)} title="Напомнить об оплате">
                      <Icon name="bell" size={14} />
                    </button>
                    <button
                      className={`${styles.actionBtn} ${!s.is_active ? styles.activateBtn : styles.deactivateBtn}`}
                      onClick={() => handleToggleActive(s.id, s.name, s.is_active)}
                      title={s.is_active ? 'Деактивировать' : 'Активировать'}
                    >
                      <Icon name={s.is_active ? 'eyeOff' : 'eye'} size={14} />
                    </button>
                    <button className={`${styles.actionBtn} ${styles.deleteActionBtn}`} onClick={() => handleDelete(s.id, s.name)} title="Удалить">
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <form className={styles.modal} onSubmit={handleSave} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{editingId ? 'Редактировать ученика' : 'Новый ученик'}</h2>
            <div className={styles.formGroup}>
              <label className={styles.label}>Имя *</label>
              <input className={styles.input} value={formName} onChange={(e) => setFormName(e.target.value)} required autoFocus />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Телефон</label>
              <input className={styles.input} value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="+375..." />
            </div>
            {tutorSubjects.length > 0 && (
              <div className={styles.formGroup}>
                <label className={styles.label}>Предметы</label>
                <div className={styles.subjectChips}>
                  {tutorSubjects.map((subj) => (
                    <label key={subj} className={`${styles.subjectChip} ${formSubjects.includes(subj) ? styles.subjectChipActive : ''}`}>
                      <input type="checkbox" checked={formSubjects.includes(subj)} onChange={() => toggleSubject(subj)} className={styles.hiddenCheckbox} />
                      {subj}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className={styles.formGroup}>
              <label className={styles.label}>Заметки</label>
              <textarea className={styles.textarea} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Уровень, особенности, цели..." />
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>Отмена</button>
              <button type="submit" className={styles.submitBtn} disabled={saving}>
                {saving ? 'Сохранение...' : editingId ? 'Сохранить' : 'Создать'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}