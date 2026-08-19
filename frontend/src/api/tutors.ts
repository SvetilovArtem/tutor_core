import api from './client';

export interface TutorSettings {
  working_hours: Record<string, { enabled: boolean; start: string; end: string }>;
}

export interface Service {
  title: string;
  description: string;
  price: number;
}

export interface Testimonial {
  name: string;
  text: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface Tutor {
  id: number;
  name: string;
  telegram_id: number | null;
  email: string | null;
  phone: string | null;
  subjects: string[];
  timezone: string;
  currency: string;
  is_active: boolean;
  created_at: string | null;

  slug: string | null;
  landing_headline: string | null;
  landing_bio: string | null;
  photo_url: string | null;
  landing_theme: string;
  is_landing_published: boolean;

  services: Service[];
  testimonials: Testimonial[];
  faq: FaqItem[];

  settings: TutorSettings | null;
}

export interface TokenResponse {
  access_token: string;
  tutor: Tutor;
}

export const tutorsApi = {
  login: (email: string, password: string) =>
    api.post<TokenResponse>('/tutors/login', { email, password }),
  getMe: () => api.get<Tutor>('/tutors/me'),
  updateMe: (data: Partial<Tutor>) => api.patch<Tutor>('/tutors/me', data),
};