import api from './client';

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface StudentSubject {
  subject: string;
  price_per_lesson: number;
}

export interface Student {
  id: number;
  name: string;
  parent_id: number | null;
  phone: string | null;
  email: string | null;
  telegram_id: number | null;
  birth_date: string | null;
  notes: string | null;
  is_active: boolean;
  subjects: StudentSubject[];
  balance: number;
  invite_code?: string | null;
}

export interface StudentsListParams {
  page?: number;
  limit?: number;
  search?: string;
  subject?: string;
  is_active?: boolean;
  sort_by?: 'name' | 'created_at';
  sort_order?: 'asc' | 'desc';
}

export interface StudentCreate {
  name: string;
  phone?: string;
  email?: string;
  telegram_id?: number;
  birth_date?: string;
  notes?: string;
  subjects: { subject: string; price_per_lesson: number }[];
}

export interface StudentUpdate {
  name?: string;
  phone?: string;
  email?: string;
  telegram_id?: number;
  birth_date?: string;
  notes?: string;
  subjects?: { subject: string; price_per_lesson: number }[];
  invite_code?: string | null;
}

export const studentsApi = {
  list: (params?: StudentsListParams) => 
    api.get<PaginatedResponse<Student>>('/students/', { params }),

  create: (data: StudentCreate) => api.post<Student>('/students/', data),
  get: (id: number) => api.get<Student>(`/students/${id}`),
  update: (id: number, data: StudentUpdate) => api.patch<Student>(`/students/${id}`, data),
  toggleActive: (id: number) => api.patch<Student>(`/students/${id}/toggle-active`, {}),
  delete: (id: number) => api.delete(`/students/${id}`),
  remindPayment: (id: number) => api.post(`/students/${id}/remind-payment`),
  adjustBalance: (id: number, amount: number, comment?: string) => 
    api.post(`/students/${id}/adjust`, { amount, comment }),
  generateInviteCode: (id: number) => api.post<{ code: string }>(`/students/${id}/invite-code`),
};