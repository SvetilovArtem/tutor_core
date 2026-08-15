import api from './client';

export interface Package {
  id: number;
  tutor_id: number;
  student_id: number;
  name: string;
  total_lessons: number;
  remaining_lessons: number;
  price_per_lesson: number;
  duration_minutes: number;
  expires_at: string | null;
  payment_status: 'paid' | 'unpaid';
  purchased_at: string;
}

export interface PackageCreate {
  student_id: number;
  name: string;
  total_lessons: number;
  price_per_lesson: number;
  duration_minutes?: number;
  payment_status?: string;
}

export const packagesApi = {
  list: (studentId?: number) =>
    api.get<Package[]>('/packages/', { params: studentId ? { student_id: studentId } : {} }),
  create: (data: PackageCreate) => api.post<Package>('/packages/', data),
  delete: (id: number) => api.delete(`/packages/${id}`),
  pay: (id: number) => api.post(`/packages/${id}/pay`),
};