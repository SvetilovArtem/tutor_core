import { useEffect, useState } from 'react';
import { format, subDays, subWeeks, subMonths, subYears, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { ru } from 'date-fns/locale';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, Cell 
} from 'recharts';
import Icon from '../components/Icon';
import StatusBadge from '../components/StatusBadge';
import { dashboardApi } from '../api/dashboard';
import styles from './DashboardPage.module.css';

type IncomePeriod = 'day' | 'week' | 'month' | 'year';
type WorkloadPeriod = 'week' | 'month' | 'all';

const maxPeriods: Record<IncomePeriod, number> = {
  day: 30,
  week: 15 * 7,
  month: 12 * 30,
  year: 10 * 365,
};

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function DashboardPage() {
  const [summary, setSummary] = useState<any>(null);
  const [incomeData, setIncomeData] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  
  const [incomePeriod, setIncomePeriod] = useState<IncomePeriod>('month');
  const [workloadPeriod, setWorkloadPeriod] = useState<WorkloadPeriod>('month');
  
  const [dateFrom, setDateFrom] = useState(format(subMonths(new Date(), 12), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [sumRes, incRes, analyticsRes] = await Promise.all([
          dashboardApi.getSummary(),
          dashboardApi.getIncome(incomePeriod, dateFrom, dateTo),
          dashboardApi.getAnalytics(workloadPeriod),
        ]);
        setSummary(sumRes.data);
        setIncomeData(incRes.data.data);
        setAnalytics(analyticsRes.data);
      } catch (err: any) {
        console.error('Ошибка загрузки дашборда', err);
        if (err.response?.data?.detail) {
          alert(err.response.data.detail);
        }
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [incomePeriod, dateFrom, dateTo, workloadPeriod]);

  const handleIncomePeriodChange = (period: IncomePeriod) => {
    setIncomePeriod(period);
    const now = new Date();
    if (period === 'day') {
      setDateFrom(format(subDays(now, 30), 'yyyy-MM-dd'));
      setDateTo(format(now, 'yyyy-MM-dd'));
    } else if (period === 'week') {
      setDateFrom(format(subWeeks(now, 15), 'yyyy-MM-dd'));
      setDateTo(format(now, 'yyyy-MM-dd'));
    } else if (period === 'month') {
      setDateFrom(format(subMonths(now, 12), 'yyyy-MM-dd'));
      setDateTo(format(now, 'yyyy-MM-dd'));
    } else if (period === 'year') {
      setDateFrom(format(subYears(now, 10), 'yyyy-MM-dd'));
      setDateTo(format(now, 'yyyy-MM-dd'));
    }
  };

  const handleDayChange = (field: 'from' | 'to', value: string) => {
    if (field === 'from') setDateFrom(value);
    else setDateTo(value);
  };

  const handleWeekChange = (field: 'from' | 'to', value: string) => {
    if (!value) return;
    const [year, week] = value.split('-W').map(Number);
    const date = new Date(year, 0, 1 + (week - 1) * 7);
    const dayOfWeek = date.getDay();
    const monday = new Date(date);
    monday.setDate(date.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    if (field === 'from') setDateFrom(format(monday, 'yyyy-MM-dd'));
    else setDateTo(format(sunday, 'yyyy-MM-dd'));
  };

  const handleMonthChange = (field: 'from' | 'to', value: string) => {
    if (!value) return;
    const [year, month] = value.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    if (field === 'from') setDateFrom(format(startOfMonth(date), 'yyyy-MM-dd'));
    else setDateTo(format(endOfMonth(date), 'yyyy-MM-dd'));
  };

  const handleYearChange = (field: 'from' | 'to', value: string) => {
    if (!value) return;
    const year = Number(value);
    const date = new Date(year, 0, 1);
    if (field === 'from') setDateFrom(format(startOfYear(date), 'yyyy-MM-dd'));
    else setDateTo(format(endOfYear(date), 'yyyy-MM-dd'));
  };

  const weekFromValue = `${format(new Date(dateFrom), 'yyyy')}-W${String(Math.ceil((+new Date(dateFrom) - +startOfWeek(new Date(dateFrom), { weekStartsOn: 1 }) + 1) / 7)).padStart(2, '0')}`;
  const weekToValue = `${format(new Date(dateTo), 'yyyy')}-W${String(Math.ceil((+new Date(dateTo) - +startOfWeek(new Date(dateTo), { weekStartsOn: 1 }) + 1) / 7)).padStart(2, '0')}`;
  const monthFromValue = format(new Date(dateFrom), 'yyyy-MM');
  const monthToValue = format(new Date(dateTo), 'yyyy-MM');
  const yearFromValue = format(new Date(dateFrom), 'yyyy');
  const yearToValue = format(new Date(dateTo), 'yyyy');

  if (loading) return <div className={styles.loading}>Загрузка дашборда...</div>;
  if (!summary || !analytics) return <div className={styles.empty}>Не удалось загрузить данные</div>;

  const formatXAxis = (value: string) => {
    if (incomePeriod === 'day') return value.slice(5);
    if (incomePeriod === 'week') return value.slice(2);
    if (incomePeriod === 'year') return value;
    return value.slice(5);
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Дашборд</h1>

      <div className={styles.kpiGrid}>
        <div className={`${styles.card} ${styles.incomeCard}`}>
          <div className={styles.cardIcon}><Icon name="wallet" size={24} /></div>
          <div>
            <div className={styles.cardLabel}>Доход за месяц</div>
            <div className={styles.cardValue}>{Number(summary.income_this_month).toFixed(2)} BYN</div>
          </div>
        </div>
        <div className={`${styles.card} ${styles.studentsCard}`}>
          <div className={styles.cardIcon}><Icon name="users" size={24} /></div>
          <div>
            <div className={styles.cardLabel}>Активные ученики</div>
            <div className={styles.cardValue}>{summary.active_students}</div>
          </div>
        </div>
        <div className={`${styles.card} ${styles.debtCard}`}>
          <div className={styles.cardIcon}><Icon name="minus" size={24} /></div>
          <div>
            <div className={styles.cardLabel}>Общая задолженность</div>
            <div className={styles.cardValue}>{Number(summary.total_debt).toFixed(2)} BYN</div>
          </div>
        </div>
        <div className={`${styles.card} ${styles.lessonsCard}`}>
          <div className={styles.cardIcon}><Icon name="calendar" size={24} /></div>
          <div>
            <div className={styles.cardLabel}>Уроков сегодня</div>
            <div className={styles.cardValue}>{summary.lessons_today}</div>
          </div>
        </div>
      </div>

      <div className={styles.chartCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 16 }}>
          <h3 className={styles.chartTitle} style={{ margin: 0 }}>💰 Доход</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className={styles.periodSelector}>
              <button className={`${styles.periodBtn} ${incomePeriod === 'day' ? styles.active : ''}`} onClick={() => handleIncomePeriodChange('day')}>По дням</button>
              <button className={`${styles.periodBtn} ${incomePeriod === 'week' ? styles.active : ''}`} onClick={() => handleIncomePeriodChange('week')}>По неделям</button>
              <button className={`${styles.periodBtn} ${incomePeriod === 'month' ? styles.active : ''}`} onClick={() => handleIncomePeriodChange('month')}>По месяцам</button>
              <button className={`${styles.periodBtn} ${incomePeriod === 'year' ? styles.active : ''}`} onClick={() => handleIncomePeriodChange('year')}>По годам</button>
            </div>
            
            <div className={styles.dateRangePicker}>
              {incomePeriod === 'day' && (
                <>
                  <input type="date" value={dateFrom} onChange={(e) => handleDayChange('from', e.target.value)} />
                  <span className={styles.dateSeparator}>—</span>
                  <input type="date" value={dateTo} onChange={(e) => handleDayChange('to', e.target.value)} />
                </>
              )}
              {incomePeriod === 'week' && (
                <>
                  <input type="week" value={weekFromValue} onChange={(e) => handleWeekChange('from', e.target.value)} />
                  <span className={styles.dateSeparator}>—</span>
                  <input type="week" value={weekToValue} onChange={(e) => handleWeekChange('to', e.target.value)} />
                </>
              )}
              {incomePeriod === 'month' && (
                <>
                  <input type="month" value={monthFromValue} onChange={(e) => handleMonthChange('from', e.target.value)} />
                  <span className={styles.dateSeparator}>—</span>
                  <input type="month" value={monthToValue} onChange={(e) => handleMonthChange('to', e.target.value)} />
                </>
              )}
              {incomePeriod === 'year' && (
                <>
                  <input type="number" min="2015" max="2035" value={yearFromValue} onChange={(e) => handleYearChange('from', e.target.value)} />
                  <span className={styles.dateSeparator}>—</span>
                  <input type="number" min="2015" max="2035" value={yearToValue} onChange={(e) => handleYearChange('to', e.target.value)} />
                </>
              )}
            </div>
          </div>
        </div>
        
        <ResponsiveContainer width="100%" height={300}>
          {incomeData.length > 0 ? (
            <LineChart data={incomeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis 
                dataKey="month" 
                tick={{fontSize: 10, fill: '#9ca3af'}} 
                tickFormatter={formatXAxis}
                interval={0}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{fontSize: 11, fill: '#9ca3af'}} width={40} />
              <Tooltip 
                formatter={(value: any) => `${Number(value).toFixed(2)} BYN`} 
                contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'}}
                labelFormatter={(label) => `Период: ${label}`}
              />
              <Line 
                type="monotone" 
                dataKey="amount" 
                stroke="#6366f1" 
                strokeWidth={2} 
                dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} 
                activeDot={{ r: 6 }}
              />
            </LineChart>
          ) : (
            <div className={styles.emptyChart}>Нет данных за выбранный период</div>
          )}
        </ResponsiveContainer>
      </div>

      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>📈 Динамика посещаемости</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={analytics.attendance_trend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{fontSize: 10}} stroke="#9ca3af" tickFormatter={(str) => str.slice(5)} />
              <YAxis tick={{fontSize: 12}} stroke="#9ca3af" />
              <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'}} />
              <Line type="monotone" dataKey="present" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Присутствовал" />
              <Line type="monotone" dataKey="absent" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Отсутствовал" />
              <Line type="monotone" dataKey="cancelled" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Отменён" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>📚 Доход по предметам</h3>
          <ResponsiveContainer width="100%" height={280}>
            {analytics.income_by_subject.length > 0 ? (
              <BarChart data={analytics.income_by_subject} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e7eb" />
                <XAxis type="number" tick={{fontSize: 12}} stroke="#9ca3af" />
                <YAxis dataKey="subject" type="category" tick={{fontSize: 12}} stroke="#9ca3af" width={100} />
                <Tooltip formatter={(value: any) => `${Number(value).toFixed(2)} BYN`} cursor={{fill: 'transparent'}} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]} barSize={20}>
                  {analytics.income_by_subject.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            ) : <div className={styles.emptyChart}>Нет данных</div>}
          </ResponsiveContainer>
        </div>
      </div>

      <div className={styles.chartCard} style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 className={styles.chartTitle} style={{ margin: 0 }}>📅 Загрузка по дням недели</h3>
          <div className={styles.periodSelector}>
            <button className={`${styles.periodBtn} ${workloadPeriod === 'week' ? styles.active : ''}`} onClick={() => setWorkloadPeriod('week')}>Текущая неделя</button>
            <button className={`${styles.periodBtn} ${workloadPeriod === 'month' ? styles.active : ''}`} onClick={() => setWorkloadPeriod('month')}>Месяц</button>
            <button className={`${styles.periodBtn} ${workloadPeriod === 'all' ? styles.active : ''}`} onClick={() => setWorkloadPeriod('all')}>Всё время</button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={analytics.workload_by_day}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="day" tick={{fontSize: 12}} stroke="#9ca3af" />
            <YAxis allowDecimals={false} tick={{fontSize: 12}} stroke="#9ca3af" />
            <Tooltip 
              formatter={(value: any) => `${value} уроков`} 
              cursor={{fill: 'rgba(99, 102, 241, 0.05)'}}
              labelFormatter={(label) => `День: ${label}`}
            />
            <Bar dataKey="lessons" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={30} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.bottomGrid}>
        <div className={styles.listCard}>
          <h3 className={styles.chartTitle}>Уроки сегодня</h3>
          {summary.today_lessons_list.length === 0 ? (
            <p className={styles.emptyText}>Сегодня уроков нет 🎉</p>
          ) : (
            <div className={styles.lessonList}>
              {summary.today_lessons_list.map((lesson: any) => (
                <div key={lesson.id} className={styles.lessonItem}>
                  <div className={styles.lessonTime}>{format(new Date(lesson.start_at), 'HH:mm', { locale: ru })}</div>
                  <div className={styles.lessonInfo}>
                    <div className={styles.lessonStudents}>{lesson.students.join(', ')}</div>
                    <div className={styles.lessonSubject}>{lesson.subject || 'Без предмета'}</div>
                  </div>
                  <StatusBadge status={lesson.status.toLowerCase()} type="lesson" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.listCard}>
          <h3 className={styles.chartTitle}>Должники</h3>
          {summary.debtors.length === 0 ? (
            <p className={styles.emptyText}>Все ученики оплатили вовремя!</p>
          ) : (
            <div className={styles.debtorList}>
              {summary.debtors.slice(0, 5).map((d: any) => (
                <div key={d.id} className={styles.debtorItem}>
                  <div className={styles.debtorName}>{d.name}</div>
                  <div className={styles.debtorBalance}>-{Math.abs(d.balance).toFixed(2)} BYN</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}