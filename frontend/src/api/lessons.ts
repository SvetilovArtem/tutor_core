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

export const lessonsApi = {
  list: () => api.get<Lesson[]>('/lessons/'),
  updateStatus: (id: number, status: string) =>
    api.patch<Lesson>(`/lessons/${id}/status`, { status }),
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