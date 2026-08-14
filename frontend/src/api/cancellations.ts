import api from './client';

export interface CancellationRequest {
  id: number;
  lesson_id: number;
  student_id: number;
  student_name: string | null;
  lesson_start_at: string | null;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requested_at: string;
  resolved_at: string | null;
  tutor_comment: string | null;
}

export const cancellationsApi = {
  list: (status?: string) =>
    api.get<CancellationRequest[]>('/cancellations/', {
      params: status ? { status } : undefined,
    }),
  resolve: (id: number, approve: boolean, comment?: string) =>
    api.post<CancellationRequest>(`/cancellations/${id}/resolve`, {
      approve,
      comment,
    }),
};