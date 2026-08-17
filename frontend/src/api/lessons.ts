import api from './client';
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface LessonStudent {
  student_id: number;
  student_name: string;
  status: string;
  package_id?: number | null;
  price_charged?: number | null;
  is_paid?: boolean;
}

export interface HomeworkAttachment {
  id: number;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  url: string;
  is_image: boolean;
  uploaded_at: string | null;
}

export interface Lesson {
  id: number;
  tutor_id: number;
  schedule_rule_id?: number | null;
  exception_id?: number | null;
  start_at: string;
  end_at: string;
  status: string;
  subject?: string | null;
  meeting_url?: string | null;
  homework_text?: string | null;
  tutor_notes?: string | null;
  materials_url?: string | null;
  recording_url?: string | null;
  max_students?: number | null;
  created_at: string;
  students: LessonStudent[];
  homework_attachments: HomeworkAttachment[];
}

export interface LessonCreate {
  start_at: string;
  duration_minutes: number;
  subject?: string;
  students: { student_id: number; package_id?: number }[];
  meeting_url?: string;
  homework_text?: string;
  max_students?: number;
}

export interface TrialLessonCreate {
  student_name: string;
  parent_name?: string;
  parent_phone?: string;
  parent_telegram_id?: number;
  subject?: string;
  start_at: string;
  duration_minutes: number;
  meeting_url?: string;
  notes?: string;
}

export const lessonsApi = {

  list: (params?: { page?: number; limit?: number; date_from?: string; date_to?: string; status?: string; student_ids?: number[] }) => {
    const queryParams: any = params ? { ...params } : {};
    if (params?.student_ids && params.student_ids.length > 0) {
      queryParams.student_ids = params.student_ids.join(',');
    }
    return api.get<PaginatedResponse<Lesson>>('/lessons/', { params: queryParams });
  },
  
  create: (data: LessonCreate) => api.post<Lesson>('/lessons/', data),
  createTrial: (data: TrialLessonCreate) => api.post<Lesson>('/lessons/trial', data),
  createQuick: (data: any) => api.post<Lesson>('/lessons/quick', data),
  delete: (id: number) => api.delete(`/lessons/${id}`),
  
  cancel: (id: number) => api.patch<Lesson>(`/lessons/${id}/status`, { status: 'CANCELLED' }),
  restore: (id: number) => api.patch<Lesson>(`/lessons/${id}/status`, { status: 'SCHEDULED' }),
  
  payLesson: (lessonId: number, student_ids: number[], amount: number, comment?: string) => 
    api.post(`/lessons/${lessonId}/pay`, { student_ids, amount, comment }),

  complete: (id: number, data: any) => api.post<Lesson>(`/lessons/${id}/complete`, data),
  updateStatus: (id: number, status: string) => api.patch<Lesson>(`/lessons/${id}/status`, { status }),
  updateLessonTime: (lessonId: number, start_at: string, end_at: string) =>
    api.patch<Lesson>(`/lessons/${lessonId}/time`, { start_at, end_at }),

  uploadAttachment: (lessonId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<HomeworkAttachment>(`/lessons/${lessonId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  deleteAttachment: (attachmentId: number) => api.delete(`/lessons/attachments/${attachmentId}`),
};