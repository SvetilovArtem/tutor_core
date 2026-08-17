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

export const dashboardApi = {
  getSummary: () => api.get<DashboardSummary>('/dashboard/summary'),
};