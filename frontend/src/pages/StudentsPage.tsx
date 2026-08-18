import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import Icon from '../components/Icon';
import StatusBadge from '../components/StatusBadge';
import Pagination from '../components/Pagination';
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

  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterActive, setFilterActive] = useState<boolean | ''>('');
  const [sort, setSort] = useState<SortConfig>({ field: 'name', order: 'asc' });

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formTelegramId, setFormTelegramId] = useState('');
  const [formBirthDate, setFormBirthDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  
  const [formSubjects, setFormSubjects] = useState<{ subject: string; price: string }[]>([]);

  const [showDeductModal, setShowDeductModal] = useState<Student | null>(null);
  const [deductAmount, setDeductAmount] = useState('');
  const [deductComment, setDeductComment] = useState('Ошибочное начисление');
  const [processingDeduct, setProcessingDeduct] = useState(false);

  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  const loadStudents = useCallback(() => {
    setLoading(true);
    const params: StudentsListParams = {
      page: currentPage,
      limit: limit,
    };
    if (search.trim()) params.search = search.trim();
    if (filterSubject) params.subject = filterSubject;
    if (filterActive !== '') params.is_active = filterActive === true;
    params.sort_by = sort.field;
    params.sort_order = sort.order;

    studentsApi.list(params)
      .then((r) => {
        setStudents(r.data.items);
        setTotalPages(r.data.total_pages);
      })
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [search, filterSubject, filterActive, sort, currentPage, limit]);

  useEffect(() => {
    tutorsApi.getMe().then((r) => setTutorSubjects(r.data.subjects || [])).catch(() => {});
  }, []);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  useEffect(() => {
    setCurrentPage(1);
    const timer = setTimeout(() => loadStudents(), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSort = (field: SortField) => {
    setCurrentPage(1);
    setSort((prev) => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sort.field !== field) return <span className={styles.sortIconPlaceholder}></span>;
    return <span className={styles.sortIcon}>{sort.order === 'asc' ? '↑' : '↓'}</span>;
  };

  const resetForm = () => {
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormTelegramId('');
    setFormBirthDate('');
    setFormNotes('');
    setFormSubjects([]);
  };

  const openEdit = (s: Student) => {
    setEditingId(s.id);
    setFormName(s.name);
    setFormPhone(s.phone || '');
    setFormEmail(s.email || '');
    setFormTelegramId(s.telegram_id ? String(s.telegram_id) : '');
    setFormBirthDate(s.birth_date || '');
    setFormNotes(s.notes || '');
    setFormSubjects(s.subjects.map(sub => ({ subject: sub.subject, price: String(sub.price_per_lesson) })));
    setShowModal(true);
  };

  const openCreate = () => {
    setEditingId(null);
    resetForm();
    setFormSubjects([{ subject: '', price: '25' }]);
    setShowModal(true);
  };

  const addSubject = () => {
    setFormSubjects([...formSubjects, { subject: '', price: '25' }]);
  };

  const removeSubject = (index: number) => {
    setFormSubjects(formSubjects.filter((_, i) => i !== index));
  };

  const updateSubject = (index: number, field: 'subject' | 'price', value: string) => {
    setFormSubjects(formSubjects.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formSubjects.length === 0) {
      toast.error('Добавьте хотя бы один предмет с ценой');
      return;
    }
    const invalidSubjects = formSubjects.filter(s => !s.subject || !s.price);
    if (invalidSubjects.length > 0) {
      toast.error('Заполните все предметы и цены');
      return;
    }

    setSaving(true);
    try {
      const payload: StudentCreate = {
        name: formName,
        phone: formPhone || undefined,
        email: formEmail || undefined,
        telegram_id: formTelegramId ? Number(formTelegramId) : undefined,
        birth_date: formBirthDate || undefined,
        notes: formNotes || undefined,
        subjects: formSubjects.map(s => ({ subject: s.subject, price_per_lesson: Number(s.price) })),
      };

      if (editingId) {
        await studentsApi.update(editingId, payload);
        toast.success('Ученик обновлён');
      } else {
        await studentsApi.create(payload);
        toast.success('Ученик создан');
      }
      setShowModal(false);
      loadStudents();
    } catch (err: any) {
      const errorDetail = err.response?.data?.detail;
      let errorMessage = 'Ошибка сохранения';
      if (typeof errorDetail === 'string') errorMessage = errorDetail;
      else if (Array.isArray(errorDetail) && errorDetail.length > 0) errorMessage = errorDetail[0].msg;
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (id: number) => {
    try {
      await studentsApi.toggleActive(id);
      toast.success('Статус изменён');
      loadStudents();
    } catch {
      toast.error('Ошибка изменения статуса');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить ученика? Это действие необратимо.')) return;
    try {
      await studentsApi.delete(id);
      toast.success('Ученик удалён');
      loadStudents();
    } catch {
      toast.error('Ошибка удаления');
    }
  };

  const handleDeductBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showDeductModal || !deductAmount) return;
    setProcessingDeduct(true);
    try {
      await studentsApi.adjustBalance(showDeductModal.id, -Number(deductAmount), deductComment);
      toast.success('Средства списаны');
      setShowDeductModal(null);
      setDeductAmount('');
      setDeductComment('Ошибочное начисление');
      loadStudents();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка списания');
    } finally {
      setProcessingDeduct(false);
    }
  };

  const handleGenerateInviteCode = async (studentId: number) => {
    setGeneratingCode(true);
    try {
      const res = await studentsApi.generateInviteCode(studentId);
      setInviteCode(res.data.code);
      toast.success('Код сгенерирован');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка генерации кода');
    } finally {
      setGeneratingCode(false);
    }
  };

  const copyInviteCode = () => {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode);
      toast.success('Код скопирован');
    }
  };

  if (loading) return <div className={styles.loading}>Загрузка...</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Ученики</h1>
        <button className={styles.addBtn} onClick={openCreate}>
          <Icon name="plus" size={18} /> Добавить ученика
        </button>
      </div>

      <div className={styles.filtersPanel}>
        <div className={styles.filterGroup}>
          <input
            className={styles.input}
            type="text"
            placeholder="Поиск по имени или телефону..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <select className={styles.input} value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
            <option value="">Все предметы</option>
            {tutorSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <select className={styles.input} value={filterActive === '' ? '' : String(filterActive)} onChange={(e) => setFilterActive(e.target.value === '' ? '' : e.target.value === 'true')}>
            <option value="">Все статусы</option>
            <option value="true">Активные</option>
            <option value="false">Неактивные</option>
          </select>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        {students.length === 0 ? (
          <div className={styles.empty}>Ученики не найдены</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th onClick={() => handleSort('name')} className={styles.sortable}>
                  Имя <SortIcon field="name" />
                </th>
                <th>Контакты</th>
                <th>Предметы</th>
                <th>Баланс</th>
                <th>Статус</th>
                <th className={styles.actionsHeader}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className={styles.studentName}>{s.name}</div>
                    
                  </td>
                  <td>
                    {s.phone && <div className={styles.contactLine}>📞 {s.phone}</div>}
                    {s.email && <div className={styles.contactLine}>✉️ {s.email}</div>}
                    {s.telegram_id && <div className={styles.contactLine}>💬 {s.telegram_id}</div>}
                  </td>
                  <td>
                    <div className={styles.subjectsList}>
                      {s.subjects.map((sub, idx) => (
                        <span key={idx} className={styles.subjectBadge}>
                          {sub.subject} ({sub.price_per_lesson} BYN)
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className={`${styles.balance} ${Number(s.balance) < 0 ? styles.negative : ''}`}>
                      {Number(s.balance).toFixed(2)} BYN
                    </div>
                  </td>
                  <td>
                    <button className={styles.statusBtn} onClick={() => handleToggleActive(s.id)}>
                      <StatusBadge status={s.is_active ? 'active' : 'inactive'} type="student" />
                    </button>
                  </td>
                  <td className={styles.actionsCell}>
                    <button className={styles.actionBtn} onClick={() => openEdit(s)} title="Редактировать">
                      <Icon name="edit" size={14} />
                    </button>
                    <button 
                      className={styles.actionBtn} 
                      onClick={() => handleGenerateInviteCode(s.id)} 
                      title="Код для бота"
                      disabled={generatingCode}
                    >
                      <Icon name="key" size={14} />
                    </button>
                    <button 
                      className={styles.actionBtn} 
                      onClick={() => {
                        setShowDeductModal(s);
                        setDeductAmount('');
                        setDeductComment('Ошибочное начисление');
                      }} 
                      title="Списать с баланса"
                    >
                      <Icon name="minus" size={14} />
                    </button>
                    <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => handleDelete(s.id)} title="Удалить">
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && students.length > 0 && (
        <div className={styles.paginationWrapper}>
          <div className={styles.limitSelector}>
            <label>Показывать по:</label>
            <select 
              className={styles.limitSelect}
              value={limit} 
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          
          {totalPages > 1 && (
            <Pagination 
              currentPage={currentPage} 
              totalPages={totalPages} 
              onPageChange={setCurrentPage} 
            />
          )}
        </div>
      )}

      {inviteCode && (
        <div className={styles.modalOverlay} onClick={() => setInviteCode(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Код для привязки ученика</h2>
            <p className={styles.modalHint}>Отправьте этот код ученику для привязки к Telegram-боту</p>
            <div className={styles.inviteCodeDisplay}>
              <span className={styles.inviteCodeText}>{inviteCode}</span>
              <button className={styles.copyBtn} onClick={copyInviteCode}>
                <Icon name="copy" size={16} /> Скопировать
              </button>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.submitBtn} onClick={() => setInviteCode(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <form className={styles.modal} onSubmit={handleSave} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{editingId ? 'Редактировать ученика' : 'Новый ученик'}</h2>
            
            <div className={styles.formGroup}>
              <label className={styles.label}>Имя *</label>
              <input className={styles.input} value={formName} onChange={(e) => setFormName(e.target.value)} required autoFocus />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Телефон</label>
                <input className={styles.input} value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="+375..." />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Email</label>
                <input className={styles.input} type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Telegram ID</label>
                <input className={styles.input} type="number" value={formTelegramId} onChange={(e) => setFormTelegramId(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Дата рождения</label>
                <input className={styles.input} type="date" value={formBirthDate} onChange={(e) => setFormBirthDate(e.target.value)} />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Предметы и стоимость *</label>
              {formSubjects.map((subj, index) => (
                <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <select 
                    className={styles.input} 
                    style={{ flex: 2 }}
                    value={subj.subject} 
                    onChange={(e) => updateSubject(index, 'subject', e.target.value)}
                    required
                  >
                    <option value="">Выберите предмет</option>
                    {tutorSubjects.map((tSubj) => (
                      <option key={tSubj} value={tSubj}>{tSubj}</option>
                    ))}
                  </select>
                  <input 
                    className={styles.input} 
                    style={{ flex: 1 }}
                    type="number" 
                    min="0" 
                    step="0.01" 
                    placeholder="Цена"
                    value={subj.price} 
                    onChange={(e) => updateSubject(index, 'price', e.target.value)}
                    required
                  />
                  <button 
                    type="button" 
                    className={styles.actionBtn} 
                    onClick={() => removeSubject(index)}
                    title="Удалить предмет"
                    style={{ color: 'var(--color-danger)', flex: '0 0 32px' }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
              <button 
                type="button" 
                className={styles.submitBtn} 
                onClick={addSubject} 
                style={{ marginTop: '8px', width: '100%', background: 'var(--bg-hover)', color: 'var(--text-main)' }}
              >
                <Icon name="plus" size={14} /> Добавить предмет
              </button>
            </div>
            
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

      {showDeductModal && (
        <div className={styles.modalOverlay} onClick={() => setShowDeductModal(null)}>
          <form className={styles.modal} onSubmit={handleDeductBalance} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Списать с баланса: {showDeductModal.name}</h2>
            <p className={styles.modalHint}>Используйте для возврата ошибочно начисленных средств</p>
            
            <div className={styles.formGroup}>
              <label className={styles.label}>Сумма списания (BYN) *</label>
              <input
                className={styles.input}
                type="number"
                min="0.01"
                step="0.01"
                value={deductAmount}
                onChange={(e) => setDeductAmount(e.target.value)}
                required
                autoFocus
              />
            </div>
            
            <div className={styles.formGroup}>
              <label className={styles.label}>Причина</label>
              <input
                className={styles.input}
                value={deductComment}
                onChange={(e) => setDeductComment(e.target.value)}
                placeholder="Ошибочное начисление, возврат и т.д."
              />
            </div>
            
            <div className={styles.modalActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setShowDeductModal(null)}>Отмена</button>
              <button 
                type="submit" 
                className={styles.submitBtn} 
                style={{ background: 'var(--color-warning)' }} 
                disabled={processingDeduct}
              >
                {processingDeduct ? 'Обработка...' : 'Списать'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}