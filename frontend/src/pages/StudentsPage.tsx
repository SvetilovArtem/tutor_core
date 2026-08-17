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
  const [formBasePrice, setFormBasePrice] = useState('25');
  
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

  // Дебаунс для поиска с сбросом на 1 страницу
  useEffect(() => {
    setCurrentPage(1); // Сбрасываем на первую страницу при изменении поиска
    const timer = setTimeout(() => loadStudents(), 300);
    return () => clearTimeout(timer);
  }, [search]); // Убрали loadStudents из зависимостей, чтобы не триггерить лишний раз

  const handleSort = (field: SortField) => {
    setCurrentPage(1); // Сброс страницы при сортировке
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
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormTelegramId('');
    setFormBirthDate('');
    setFormNotes('');
    setFormSubjects([]);
    setEditingId(null);
    setFormBasePrice('25');
    setInviteCode(null);
  };

  const openCreate = () => { resetForm(); setShowModal(true); };
  
  const openEdit = (s: Student) => {
    setFormName(s.name);
    setFormPhone(s.phone || '');
    setFormEmail(s.email || '');
    setFormTelegramId(s.telegram_id ? String(s.telegram_id) : '');
    setFormBirthDate(s.birth_date || '');
    setFormNotes(s.notes || '');
    setFormSubjects(s.subjects.map(subj => ({ subject: subj.subject, price: String(subj.price_per_lesson) })));
    setEditingId(s.id);
    setFormBasePrice(String(s.base_price || 25));
    setInviteCode(null);
    setShowModal(true);
  };

  const addSubject = () => {
    setFormSubjects([...formSubjects, { subject: '', price: String(formBasePrice || 25) }]);
  };

  const updateSubject = (index: number, field: 'subject' | 'price', value: string) => {
    const newSubjects = [...formSubjects];
    newSubjects[index][field] = value;
    setFormSubjects(newSubjects);
  };

  const removeSubject = (index: number) => {
    setFormSubjects(formSubjects.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);
    
    const payload: StudentCreate = {
      name: formName.trim(),
      phone: formPhone.trim() || undefined,
      email: formEmail.trim() || undefined,
      telegram_id: formTelegramId ? Number(formTelegramId) : undefined,
      birth_date: formBirthDate || undefined,
      base_price: Number(formBasePrice) || 25,
      notes: formNotes.trim() || undefined,
      subjects: formSubjects.map(s => ({ subject: s.subject, price_per_lesson: Number(s.price) || 0 })),
    };
    
    try {
      if (editingId) {
        await studentsApi.update(editingId, payload);
        toast.success('Ученик обновлён');
      } else {
        await studentsApi.create(payload);
        toast.success('Ученик создан');
      }
      setShowModal(false); 
      resetForm(); 
      loadStudents();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка сохранения');
    } finally { 
      setSaving(false); 
    }
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
      loadStudents(); // Лучше перезагрузить, чем фильтровать локально, чтобы синхронизировать пагинацию
    } catch { toast.error('Ошибка удаления'); }
  };

  const handleDeductBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showDeductModal || !deductAmount) return;
    setProcessingDeduct(true);
    try {
      const amountToDeduct = -Math.abs(Number(deductAmount));
      await studentsApi.adjustBalance(
        showDeductModal.id,
        amountToDeduct,
        deductComment || 'Корректировка баланса'
      );
      toast.success('Средства списаны, баланс обновлён');
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
      toast.success('Код успешно сгенерирован!');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка генерации кода');
    } finally {
      setGeneratingCode(false);
    }
  };

  // Хелперы для сброса страницы при смене фильтров
  const handleSubjectFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterSubject(e.target.value);
    setCurrentPage(1);
  };

  const handleActiveFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterActive(e.target.value === '' ? '' : e.target.value === 'true');
    setCurrentPage(1);
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
        <select className={styles.filterSelect} value={filterSubject} onChange={handleSubjectFilterChange}>
          <option value="">Все предметы</option>
          {tutorSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={styles.filterSelect} value={String(filterActive)} onChange={handleActiveFilterChange}>
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
                <th className={styles.balanceHeader}>Баланс</th>
                <th>Статус</th>
                <th>Заметки</th>
                <th className={styles.actionsHeader}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const balance = Number(s.balance ?? 0);
                const balanceClass = balance < 0
                  ? styles.balanceNegative
                  : balance > 0
                    ? styles.balancePositive
                    : styles.balanceZero;

                return (
                  <tr key={s.id} className={!s.is_active ? styles.inactiveRow : ''}>
                    <td className={styles.nameCell}>{s.name}</td>
                    <td className={styles.phoneCell}>{s.phone || '—'}</td>
                    <td>
                      <div className={styles.subjectTags}>
                        {s.subjects.length > 0
                          ? s.subjects.map((subj, idx) => (
                              <span key={idx} className={styles.subjectTag}>
                                {subj.subject} ({subj.price_per_lesson} BYN)
                              </span>
                            ))
                          : <span className={styles.noData}>—</span>}
                      </div>
                    </td>
                    <td className={styles.balanceCell}>
                      <span className={`${styles.balanceValue} ${balanceClass}`}>
                        {balance.toFixed(2)} BYN
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={String(s.is_active)} type="activity" />
                    </td>
                    <td className={styles.notesCell}>{s.notes || '—'}</td>
                    <td className={styles.actionsCell}>
                      <button 
                        className={styles.actionBtn} 
                        onClick={() => setShowDeductModal(s)} 
                        title="Списать с баланса (корректировка)"
                        style={{ color: 'var(--color-warning)' }}
                      >
                        <Icon name="minus" size={14} />
                      </button>
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── ПАГИНАЦИЯ ───────────────────────────────────────────── */}
      {!loading && students.length > 0 && (
        <div className={styles.paginationWrapper}>
          <div className={styles.limitSelector}>
            <label>Показывать по:</label>
            <select 
              className={styles.limitSelect}
              value={limit} 
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setCurrentPage(1); // Сброс на 1 страницу при смене лимита
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          
          <Pagination 
            currentPage={currentPage} 
            totalPages={totalPages} 
            onPageChange={setCurrentPage} 
          />
        </div>
      )}

      {/* МОДАЛКА СОЗДАНИЯ / РЕДАКТИРОВАНИЯ */}
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

            <div className={styles.formGroup}>
              <label className={styles.label}>Email</label>
              <input 
                className={styles.input} 
                type="email"
                value={formEmail} 
                onChange={(e) => setFormEmail(e.target.value)} 
                placeholder="example@mail.com" 
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Telegram ID</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  className={styles.input} 
                  type="number"
                  value={formTelegramId} 
                  onChange={(e) => setFormTelegramId(e.target.value)} 
                  placeholder="123456789" 
                  style={{ flex: 1 }}
                />
                {editingId && (
                  <button 
                    type="button" 
                    className={styles.submitBtn} 
                    style={{ padding: '0 16px', whiteSpace: 'nowrap' }}
                    onClick={() => handleGenerateInviteCode(editingId)}
                    disabled={generatingCode}
                  >
                    {generatingCode ? '...' : '🔗 Код для бота'}
                  </button>
                )}
              </div>
            </div>

            {inviteCode && (
              <div className={styles.inviteCodeBox}>
                <p>Отправьте этот код ученику для привязки к боту:</p>
                <code className={styles.codeText}>{inviteCode}</code>
                <button 
                  type="button" 
                  className={styles.copyBtn}
                  onClick={() => {
                    navigator.clipboard.writeText(inviteCode);
                    toast.success('Код скопирован в буфер обмена!');
                  }}
                >
                  Скопировать
                </button>
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.label}>Дата рождения</label>
              <input 
                className={styles.input} 
                type="date"
                value={formBirthDate} 
                onChange={(e) => setFormBirthDate(e.target.value)} 
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Стоимость урока по умолчанию (BYN) *</label>
              <input
                className={styles.input}
                type="number"
                min="0"
                step="0.01"
                value={formBasePrice}
                onChange={(e) => setFormBasePrice(e.target.value)}
                required
              />
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

      {/* МОДАЛКА СПИСАНИЯ БАЛАНСА */}
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