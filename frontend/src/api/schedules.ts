import api from './client';

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface ScheduleRuleStudent {
  id: number;
  name: string;
}

export interface ScheduleRule {
  id: number;
  tutor_id: number;
  group_name: string | null;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  effective_from: string;
  effective_to: string | null;
  students: ScheduleRuleStudent[];
}

export interface ScheduleRuleCreate {
  student_ids: number[];
  group_name: string | null;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  effective_from: string;
  effective_to: string | null;
}

export interface ScheduleRuleUpdate {
  student_ids?: number[];
  group_name?: string | null;
  weekday?: number;
  start_time?: string;
  duration_minutes?: number;
  effective_from?: string;
  effective_to?: string | null;
}

export interface ScheduleException {
  id: number;
  rule_id: number;
  date: string;
  type: 'SKIP' | 'ADD';
  start_time?: string;
  duration_minutes?: number;
  comment?: string;
}

export interface ScheduleExceptionCreate {
  rule_id: number;
  date: string;
  type: 'SKIP' | 'ADD';
  start_time?: string;
  duration_minutes?: number;
  comment?: string;
}

export interface ExistingLessonInfo {
  id: number;
  start_at: string;
  end_at: string;
  subject: string | null;
  students: string[];
}

export interface DayPreview {
  date: string;
  start_at: string;
  end_at: string;
  conflict: boolean;
  existing_lesson: ExistingLessonInfo | null;
}

export interface RulePreviewResponse {
  days: DayPreview[];
}

export const scheduleApi = {
  listRules: (params?: { page?: number; limit?: number; student_id?: number }) => 
    api.get<PaginatedResponse<ScheduleRule>>('/schedule/rules', { params }),

  createRule: (data: ScheduleRuleCreate) => api.post<any>('/schedule/rules', data),
  updateRule: (id: number, data: ScheduleRuleUpdate) => api.patch<ScheduleRule>(`/schedule/rules/${id}`, data),
  deleteRule: (id: number) => api.delete(`/schedule/rules/${id}`),

  listExceptions: (rule_id?: number) => 
    api.get<ScheduleException[]>('/schedule/exceptions', { params: rule_id ? { rule_id } : undefined }),
    
  createException: (data: ScheduleExceptionCreate) => api.post<ScheduleException>('/schedule/exceptions', data),
  deleteException: (id: number) => api.delete(`/schedule/exceptions/${id}`),

  generate: (date_from: string, date_to: string) => 
    api.post<{ created: number; skipped_dates?: string[] }>('/schedule/generate', { date_from, date_to }),

  previewRule: (data: {
    weekday: number;
    start_time: string;
    duration_minutes: number;
    student_ids: number[];
    effective_from: string;
    effective_to?: string;
  }) => api.post<RulePreviewResponse>('/schedule/rules/preview', data),
  
  createRuleWithSelectedDays: (data: {
    weekday: number;
    start_time: string;
    duration_minutes: number;
    student_ids: number[];
    effective_from: string;
    effective_to?: string;
    selected_dates: string[];
    replace_dates: string[];
  }) => api.post('/schedule/rules/create-selected', data),
};