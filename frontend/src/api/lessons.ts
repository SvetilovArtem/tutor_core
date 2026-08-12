import api from './client';

export interface LessonStudent {
  student_id: number;
  student_name: string;
  status: string;
  price_charged: number | null;
}

export interface Lesson {
  id: number;
  start_at: string;
  end_at: string;
  status: string;
  meeting_url: string | null;
  homework_text: string | null;
  max_students: number | null;
  students: LessonStudent[];
}

export interface GenerateRequest {
  date_from: string;
  date_to: string;
}

export const lessonsApi = {
  list: () => api.get<Lesson[]>('/lessons/'),
  generate: (data: GenerateRequest) => api.post('/schedule/generate', data),
};