import api from './client';

export interface TodayLesson {
  id: number;
  start_at: string;
  end_at: string;
  subject: string | null;
  status: string;
  students: string[];
}

export interface Debtor {
  id: number;
  name: string;
  balance: number;
  phone: string | null;
}

export interface RecentTransaction {
  id: number;
  student_name: string;
  amount: number;
  type: string;
  comment: string | null;
  created_at: string;
}

export interface DashboardSummary {
  lessons_today: number;
  income_this_month: number;
  active_students: number;
  total_debt: number;
  today_lessons_list: TodayLesson[];
  debtors: Debtor[];
  recent_transactions: RecentTransaction[];
}

export interface MonthlyIncome {
  month: string;
  amount: number;
}

export interface IncomeStats {
  data: MonthlyIncome[];
  total: number;
}

export interface AttendanceTrendItem {
  date: string;
  present: number;
  absent: number;
  cancelled: number;
}

export interface AttendanceStats {
  trend: AttendanceTrendItem[];
  total_present: number;
  total_absent: number;
  total_cancelled: number;
}

export interface SubjectIncome {
  subject: string;
  amount: number;
}

export interface WorkloadDay {
  day: string;
  lessons: number;
}

export interface DebtsStats {
  total_debt: number;
  debtors_count: number;
  top_debtors: Debtor[];
}

export interface DashboardAnalytics {
  income_trend: MonthlyIncome[];
  attendance_trend: AttendanceTrendItem[];
  income_by_subject: SubjectIncome[];
  workload_by_day: WorkloadDay[];
}

export const dashboardApi = {
  getSummary: () => api.get<DashboardSummary>('/dashboard/summary'),
  
  getIncome: (period: string = 'month', dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams({ period });
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    return api.get<IncomeStats>(`/dashboard/income?${params.toString()}`);
  },
  
  getAttendance: (days: number = 30) => api.get<AttendanceStats>(`/dashboard/attendance?days=${days}`),
  
  getDebts: () => api.get<DebtsStats>('/dashboard/debts'),
  
  getAnalytics: (period: string = 'month') => api.get<DashboardAnalytics>(`/dashboard/analytics?period=${period}`),
};