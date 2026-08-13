import api from './client';

export interface Student {
  id: number;
  name: string;
  parent_id: number | null;
  phone: string | null;
  telegram_id: number | null;
  birth_date: string | null;
  notes: string | null;
  subjects: string[];
  is_active: boolean;
}

export interface StudentCreate {
  name: string;
  parent_id?: number | null;
  phone?: string | null;
  telegram_id?: number | null;
  birth_date?: string | null;
  notes?: string | null;
  subjects?: string[];
}

export interface StudentsListParams {
  search?: string;
  subject?: string;
  is_active?: boolean;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export const studentsApi = {
  list: (params?: StudentsListParams) =>
    api.get<Student[]>('/students/', { params }),
  create: (data: StudentCreate) =>
    api.post<Student>('/students/', data),
  update: (id: number, data: StudentCreate) =>
    api.patch<Student>(`/students/${id}`, data),
  toggleActive: (id: number) =>
    api.patch<Student>(`/students/${id}/toggle-active`),
  remindPayment: (id: number) =>
    api.post(`/students/${id}/remind-payment`),
  delete: (id: number) =>
    api.delete(`/students/${id}`),
};