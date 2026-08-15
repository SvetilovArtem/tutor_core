import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import toast from 'react-hot-toast';
import Icon from '../components/Icon';
import { financeApi, type FinanceOverview, type Transaction } from '../api/finance';
import { studentsApi } from '../api/students';
import styles from './FinancePage.module.css';

type Tab = 'overview' | 'transactions' | 'debtors';

export default function FinancePage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState<number | null>(null);

  // Фильтры транзакций
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    loadData();
  }, [activeTab, filterDateFrom, filterDateTo, filterType]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'overview' || activeTab === 'debtors') {
        const res = await financeApi.getOverview();
        setOverview(res.data);
      }
      if (activeTab === 'transactions') {
        const res = await financeApi.getTransactions({
          date_from: filterDateFrom || undefined,
          date_to: filterDateTo || undefined,
          type: filterType || undefined,
        });
        setTransactions(res.data);
      }
    } catch {
      toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickPay = async (studentId: number, studentName: string, debt: number) => {
    const amountStr = prompt(`Принять оплату от ${studentName} для погашения долга ${Math.abs(debt).toFixed(2)} BYN:`, Math.abs(debt).toFixed(2));
    if (!amountStr) return;
    
    const amount = Number(amountStr);
    if (amount <= 0) return toast.error('Сумма должна быть больше 0');

    setProcessingPayment(studentId);
    try {
      await studentsApi.acceptPayment(studentId, amount, `Погашение долга`);
      toast.success('Оплата принята');
      loadData(); // Перезагружаем данные
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка оплаты');
    } finally {
      setProcessingPayment(null);
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      PACKAGE_PAYMENT: 'Оплата пакета',
      LESSON_DEBIT: 'Списание за урок',
      LESSON_REFUND: 'Возврат за урок',
      MANUAL_ADJUSTMENT: 'Ручное пополнение',
      MANUAL_DEDUCTION: 'Ручное списание',
    };
    return labels[type] || type;
  };

  if (loading && !overview && transactions.length === 0) {
    return <div className={styles.empty}>Загрузка...</div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Финансы</h1>
      </div>

      <div className={styles.tabs}>
        <button 
          className={`${styles.tab} ${activeTab === 'overview' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Icon name="chart" size={16} /> Обзор
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'transactions' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          <Icon name="list" size={16} /> Транзакции
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'debtors' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('debtors')}
        >
          <Icon name="alert" size={16} /> Должники ({overview?.debtors_count || 0})
        </button>
      </div>

      <div className={styles.content}>
        {/* Вкладка: ОБЗОР */}
        {activeTab === 'overview' && overview && (
          <div className={styles.overviewGrid}>
            <div className={styles.statCard}>
              <div className={styles.statIcon}>💰</div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Доход за этот месяц</span>
                <span className={styles.statValue}>{overview.monthly_income.toFixed(2)} BYN</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon}>⚠️</div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Общая задолженность</span>
                <span className={`${styles.statValue} ${styles.textDanger}`}>
                  {overview.total_debt.toFixed(2)} BYN
                </span>
                <span className={styles.statSub}>{overview.debtors_count} учеников</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon}>📦</div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Активные пакеты</span>
                <span className={styles.statValue}>{overview.active_packages_count}</span>
              </div>
            </div>
          </div>
        )}

        {/* Вкладка: ТРАНЗАКЦИИ */}
        {activeTab === 'transactions' && (
          <div className={styles.transactionsBlock}>
            <div className={styles.filters}>
              <input 
                type="date" 
                className={styles.input} 
                value={filterDateFrom} 
                onChange={(e) => setFilterDateFrom(e.target.value)} 
                placeholder="От"
              />
              <input 
                type="date" 
                className={styles.input} 
                value={filterDateTo} 
                onChange={(e) => setFilterDateTo(e.target.value)} 
                placeholder="До"
              />
              <select className={styles.select} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="">Все типы</option>
                <option value="PACKAGE_PAYMENT">Оплата пакета</option>
                <option value="LESSON_DEBIT">Списание за урок</option>
                <option value="LESSON_REFUND">Возврат за урок</option>
                <option value="MANUAL_ADJUSTMENT">Ручное пополнение</option>
                <option value="MANUAL_DEDUCTION">Ручное списание</option>
              </select>
              <button className={styles.resetBtn} onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterType(''); }}>
                Сбросить
              </button>
            </div>
            
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Ученик</th>
                    <th>Тип операции</th>
                    <th>Сумма</th>
                    <th>Баланс после</th>
                    <th>Комментарий</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr><td colSpan={6} className={styles.emptyRow}>Транзакций не найдено</td></tr>
                  ) : (
                    transactions.map((t) => (
                      <tr key={t.id}>
                        <td>{format(new Date(t.created_at), 'dd.MM.yyyy HH:mm', { locale: ru })}</td>
                        <td>{t.student_name}</td>
                        <td>{getTypeLabel(t.type)}</td>
                        <td className={t.amount > 0 ? styles.textSuccess : styles.textDanger}>
                          {t.amount > 0 ? '+' : ''}{t.amount.toFixed(2)} BYN
                        </td>
                        <td>{t.balance_after.toFixed(2)} BYN</td>
                        <td className={styles.commentCell}>{t.comment || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Вкладка: ДОЛЖНИКИ */}
        {activeTab === 'debtors' && overview && (
          <div className={styles.debtorsGrid}>
            {overview.debtors.length === 0 ? (
              <div className={styles.empty}>🎉 Отлично! Должников нет.</div>
            ) : (
              overview.debtors.map((d) => (
                <div key={d.student_id} className={styles.debtorCard}>
                  <div className={styles.debtorName}>{d.student_name}</div>
                  <div className={`${styles.debtorDebt} ${styles.textDanger}`}>
                    {d.balance.toFixed(2)} BYN
                  </div>
                  <button 
                    className={styles.payBtn}
                    onClick={() => handleQuickPay(d.student_id, d.student_name, d.balance)}
                    disabled={processingPayment === d.student_id}
                  >
                    {processingPayment === d.student_id ? '...' : 'Принять оплату'}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}