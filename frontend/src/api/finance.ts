import api from './client';

export interface FinanceOverview {
  monthly_income: number;
  total_debt: number;
  debtors_count: number;
  debtors: { student_id: number; student_name: string; balance: number }[];
  active_packages_count: number;
}

export interface Transaction {
  id: number;
  student_id: number;
  student_name: string;
  amount: number;
  type: string;
  balance_after: number;
  comment: string | null;
  created_at: string;
}

export interface TransactionsFilter {
  student_id?: number;
  type?: string;
  date_from?: string;
  date_to?: string;
}

export const financeApi = {
  getOverview: () => api.get<FinanceOverview>('/finance/overview'),
  getTransactions: (params?: TransactionsFilter) => 
    api.get<Transaction[]>('/finance/transactions', { params }),
};