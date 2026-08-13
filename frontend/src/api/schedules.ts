import api from './client';

export interface StudentBrief {
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
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  students: StudentBrief[];
}

export interface ScheduleRuleCreate {
  student_ids: number[];
  group_name?: string | null;
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
  is_active?: boolean;
}

export const scheduleApi = {
  listRules: (studentId?: number) => 
    api.get<ScheduleRule[]>('/schedule/rules', { 
      params: studentId ? { student_id: studentId } : undefined 
    }),
  createRule: (data: ScheduleRuleCreate) => 
    api.post<ScheduleRule>('/schedule/rules', data),
  updateRule: (id: number, data: ScheduleRuleUpdate) =>
    api.patch<ScheduleRule>(`/schedule/rules/${id}`, data),
  deleteRule: (id: number) => api.delete(`/schedule/rules/${id}`),
  generate: (dateFrom: string, dateTo: string) =>
    api.post('/schedule/generate', { date_from: dateFrom, date_to: dateTo }),
};