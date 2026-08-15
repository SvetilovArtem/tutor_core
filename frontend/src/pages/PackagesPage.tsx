import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '../components/Icon';
import { packagesApi, type Package } from '../api/packages';
import { studentsApi, type Student } from '../api/students';
import styles from './PackagesPage.module.css';

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const [formStudentId, setFormStudentId] = useState('');
  const [formName, setFormName] = useState('');
  const [formTotal, setFormTotal] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formDuration, setFormDuration] = useState('60');

  const loadData = () => {
    Promise.all([packagesApi.list(), studentsApi.list()])
      .then(([p, s]) => { setPackages(p.data); setStudents(s.data); })
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const getStudentName = (id: number) => students.find((s) => s.id === id)?.name || `#${id}`;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStudentId || !formName || !formTotal || !formPrice) return;
    setCreating(true);
    try {
      await packagesApi.create({
        student_id: Number(formStudentId),
        name: formName.trim(),
        total_lessons: Number(formTotal),
        price_per_lesson: Number(formPrice),
        duration_minutes: Number(formDuration),
        payment_status: 'unpaid', // По умолчанию неоплачен
      });
      toast.success('Пакет создан');
      setShowModal(false);
      setFormStudentId(''); setFormName(''); setFormTotal(''); setFormPrice(''); setFormDuration('60');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка создания');
    } finally { setCreating(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить пакет?')) return;
    try {
      await packagesApi.delete(id);
      toast.success('Пакет удалён');
      setPackages((prev) => prev.filter((p) => p.id !== id));
    } catch { toast.error('Ошибка удаления'); }
  };

  const handlePayPackage = async (pkg: Package) => {
    const totalAmount = (pkg.price_per_lesson * pkg.total_lessons).toFixed(2);
    if (!confirm(`Отметить пакет "${pkg.name}" как оплаченный?\nСумма: ${totalAmount} BYN`)) return;
    try {
      await packagesApi.pay(pkg.id);
      toast.success('Оплата зафиксирована, баланс ученика обновлён');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка оплаты');
    }
  };

  if (loading) return <div className={styles.empty}>Загрузка...</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Пакеты занятий</h1>
        <button className={styles.addBtn} onClick={() => setShowModal(true)}>
          <Icon name="plus" size={18} /> Новый пакет
        </button>
      </div>

      <div className={styles.grid}>
        {packages.length === 0 ? (
          <div className={styles.empty}>Нет пакетов. Создайте первый!</div>
        ) : (
          packages.map((pkg) => (
            <div key={pkg.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{pkg.name}</h3>
                <span className={`${styles.badge} ${pkg.payment_status === 'paid' ? styles.badgeActive : styles.badgeInactive}`}>
                  {pkg.payment_status === 'paid' ? 'Оплачен' : 'Не оплачен'}
                </span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardRow}>
                  <span className={styles.cardLabel}>Ученик</span>
                  <span className={styles.cardValue}>{getStudentName(pkg.student_id)}</span>
                </div>
                <div className={styles.cardRow}>
                  <span className={styles.cardLabel}>Остаток</span>
                  <span className={styles.cardValueHighlight}>
                    {pkg.remaining_lessons} / {pkg.total_lessons}
                  </span>
                </div>
                <div className={styles.cardRow}>
                  <span className={styles.cardLabel}>Цена за урок</span>
                  <span className={styles.cardValue}>{pkg.price_per_lesson} BYN</span>
                </div>
                <div className={styles.cardRow}>
                  <span className={styles.cardLabel}>Длительность</span>
                  <span className={styles.cardValue}>{pkg.duration_minutes} мин</span>
                </div>
              </div>
              <div className={styles.cardFooter}>
                {pkg.payment_status !== 'paid' && (
                  <button className={styles.payBtn} onClick={() => handlePayPackage(pkg)}>
                    <Icon name="check" size={14} /> Оплатить
                  </button>
                )}
                <button className={styles.deleteBtn} onClick={() => handleDelete(pkg.id)}>
                  <Icon name="trash" size={14} /> Удалить
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <form className={styles.modal} onSubmit={handleCreate} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Новый пакет</h2>
            <div className={styles.formGroup}>
              <label className={styles.label}>Ученик *</label>
              <select className={styles.input} value={formStudentId} onChange={(e) => setFormStudentId(e.target.value)} required>
                <option value="">Выберите ученика</option>
                {students.filter(s => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Название *</label>
              <input className={styles.input} value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Английский B1 — 10 занятий" required />
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Кол-во уроков *</label>
                <input className={styles.input} type="number" min="1" value={formTotal} onChange={(e) => setFormTotal(e.target.value)} required />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Цена за урок *</label>
                <input className={styles.input} type="number" min="0" step="0.01" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} required />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Длительность (мин)</label>
              <input className={styles.input} type="number" min="15" max="480" value={formDuration} onChange={(e) => setFormDuration(e.target.value)} />
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