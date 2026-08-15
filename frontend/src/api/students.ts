import api from './client';

export interface Student {
  id: number;
  name: string;
  parent_id: number | null;
  phone: string | null;
  email: string | null;       
  telegram_id: number | null;
  birth_date: string | null;
  base_price: number | string;
  notes: string | null;
  is_active: boolean;
  subjects: string[];
  balance: number | string;
}

export interface StudentsListParams {
  search?: string;
  subject?: string;
  is_active?: boolean;
  sort_by?: string;
  sort_order?: string;
}

export interface StudentCreate {
  name: string;
  phone?: string;
  email?: string;              
  telegram_id?: number;        
  birth_date?: string;        
  base_price?: number;         
  notes?: string;
  subjects?: string[];
}

export const studentsApi = {
  list: (params?: StudentsListParams) => api.get<Student[]>('/students/', { params }),
  create: (data: StudentCreate) => api.post<Student>('/students/', data),
  update: (id: number, data: Partial<StudentCreate>) => api.patch<Student>(`/students/${id}`, data),
  delete: (id: number) => api.delete(`/students/${id}`),
  toggleActive: (id: number) => api.patch<Student>(`/students/${id}/toggle-active`),
  remindPayment: (id: number) => api.post(`/students/${id}/remind-payment`),
  
  getBalance: (id: number) => api.get<{ student_id: number; balance: number }>(`/students/${id}/balance`),
  acceptPayment: (id: number, amount: number, comment?: string) =>
    api.post(`/students/${id}/payment`, { amount, comment }),
  
  adjustBalance: (id: number, amount: number, comment?: string) =>
    api.post(`/students/${id}/adjust`, { amount, comment }),
};