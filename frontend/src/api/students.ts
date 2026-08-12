import api from './client';

export interface Student {
  id: number;
  name: string;
  parent_id: number | null;
  phone: string | null;
  telegram_id: number | null;
  birth_date: string | null;
  notes: string | null;
}

export interface StudentCreate {
  name: string;
  parent_id?: number | null;
  phone?: string | null;
  telegram_id?: number | null;
  birth_date?: string | null;
  notes?: string | null;
}

export const studentsApi = {
  list: () => api.get<Student[]>('/students/'),
  create: (data: StudentCreate) => api.post<Student>('/students/', data),
  delete: (id: number) => api.delete(`/students/${id}`),
};