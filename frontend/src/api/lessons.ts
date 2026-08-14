import api from './client';

export interface LessonStudent {
  student_id: number;
  student_name: string;
  status: string;
}

export interface HomeworkAttachment {
  id: number;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  url: string;
  is_image: boolean;
  uploaded_at: string;
}

export interface Lesson {
  id: number;
  tutor_id: number;
  schedule_rule_id: number | null;
  exception_id: number | null;
  start_at: string;
  end_at: string;
  status: string;
  meeting_url: string | null;
  homework_text: string | null;
  tutor_notes: string | null;
  materials_url: string | null;
  recording_url: string | null;
  max_students: number | null;
  created_at: string;
  students: LessonStudent[];
  homework_attachments: HomeworkAttachment[];
}

export interface LessonsFilter {
  date_from?: string;
  date_to?: string;
  status?: string;
  student_ids?: number[];
}

export const lessonsApi = {
  list: (filters?: LessonsFilter) => {
    const params: Record<string, string> = {};
    if (filters?.date_from) params.date_from = filters.date_from;
    if (filters?.date_to) params.date_to = filters.date_to;
    if (filters?.status) params.status = filters.status;
    if (filters?.student_ids && filters.student_ids.length > 0) {
      params.student_ids = filters.student_ids.join(',');
    }
    return api.get<Lesson[]>('/lessons/', {
      params: Object.keys(params).length > 0 ? params : undefined,
    });
  },
  updateStatus: (id: number, status: string) =>
    api.patch<Lesson>(`/lessons/${id}/status`, { status }),
  cancel: (id: number) =>
    api.patch<Lesson>(`/lessons/${id}/status`, { status: 'CANCELLED' }),
  restore: (id: number) =>
    api.patch<Lesson>(`/lessons/${id}/status`, { status: 'SCHEDULED' }),
  uploadAttachment: (lessonId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/lessons/${lessonId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  deleteAttachment: (attachmentId: number) =>
    api.delete(`/lessons/attachments/${attachmentId}`),
};