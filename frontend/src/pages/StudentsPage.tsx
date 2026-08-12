import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '../components/Icon';
import { studentsApi, type Student } from '../api/students';
import styles from './StudentsPage.module.css';

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const loadStudents = () => {
    studentsApi.list()
      .then((r) => setStudents(r.data))
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadStudents(); }, []);

  const filtered = students.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setCreating(true);
    try {
      await studentsApi.create({
        name: formName.trim(),
        phone: formPhone.trim() || null,
        notes: formNotes.trim() || null,
      });
      toast.success('Ученик создан');
      setShowModal(false);
      setFormName(''); setFormPhone(''); setFormNotes('');
      loadStudents();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка создания');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Удалить ученика «${name}»?`)) return;
    try {
      await studentsApi.delete(id);
      toast.success('Ученик удалён');
      setStudents((prev) => prev.filter((s) => s.id !== id));
    } catch { toast.error('Ошибка удаления'); }
  };

  if (loading) return <div className={styles.empty}>Загрузка...</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Ученики</h1>
        <button className={styles.addBtn} onClick={() => setShowModal(true)}>
          <Icon name="plus" size={18} /> Добавить
        </button>
      </div>

      <div className={styles.searchWrapper}>
        <Icon name="search" size={18} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          placeholder="Поиск по имени..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.tableWrapper}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            {search ? 'Ничего не найдено' : 'Нет учеников. Добавьте первого!'}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Имя</th><th>Телефон</th><th>Заметки</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td className={styles.nameCell}>{s.name}</td>
                  <td>{s.phone || '—'}</td>
                  <td className={styles.notesCell}>{s.notes || '—'}</td>
                  <td>
                    <button className={styles.deleteBtn} onClick={() => handleDelete(s.id, s.name)}>
                      <Icon name="trash" size={14} /> Удалить
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
          <form className={styles.modal} onSubmit={handleCreate} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Новый ученик</h2>
            <div className={styles.formGroup}>
              <label className={styles.label}>Имя *</label>
              <input className={styles.input} value={formName} onChange={(e) => setFormName(e.target.value)} required autoFocus />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Телефон</label>
              <input className={styles.input} value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="+375..." />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Заметки</label>
              <textarea className={styles.textarea} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Уровень, особенности, цели..." />
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>Отмена</button>
              <button type="submit" className={styles.submitBtn} disabled={creating}>
                {creating ? 'Создание...' : 'Создать'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}