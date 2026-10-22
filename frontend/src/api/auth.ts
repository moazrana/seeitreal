import { api } from './client';
import type { PublicUser, Restaurant } from './types';

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

// Signup additionally creates the owner's first restaurant in the same request.
export interface SignupResponse extends AuthResponse {
  restaurant: Pick<Restaurant, 'id' | 'name' | 'slug'>;
}

export interface SignupInput {
  email: string;
  password: string;
  confirmPassword: string;
  businessName: string;
  address: string;
}

export const authApi = {
  signup: (input: SignupInput) => api.post<SignupResponse>('/auth/signup', input),
  login: (email: string, password: string) => api.post<AuthResponse>('/auth/login', { email, password }),
  logout: () => api.post<void>('/auth/logout'),
  refresh: () => api.post<AuthResponse>('/auth/refresh'),
};
