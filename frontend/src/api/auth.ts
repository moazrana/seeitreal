import { api } from './client';
import type { PublicUser } from './types';

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

export const authApi = {
  signup: (email: string, password: string) => api.post<AuthResponse>('/auth/signup', { email, password }),
  login: (email: string, password: string) => api.post<AuthResponse>('/auth/login', { email, password }),
  logout: () => api.post<void>('/auth/logout'),
  refresh: () => api.post<AuthResponse>('/auth/refresh'),
};
