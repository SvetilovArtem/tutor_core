import api from './client';

export interface Tutor {
  id: number;
  name: string;
  email: string | null;
  telegram_id: number | null;
  subjects: string[];
  is_active: boolean;
}

export interface TokenResponse {
  access_token: string;
  tutor: Tutor;
}

export const tutorsApi = {
  login: (email: string, password: string) =>
    api.post<TokenResponse>('/tutors/login', { email, password }),
  getMe: () => api.get<Tutor>('/tutors/me'),
};