import { createContext } from 'react';
import type { SignupInput } from '../api/auth';
import type { PublicUser, Restaurant } from '../api/types';

export interface AuthContextValue {
  user: PublicUser | null;
  /** True until the initial silent-refresh attempt (on load) resolves. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  // Resolves with the owner's newly created restaurant, so the caller can
  // route straight into it instead of the (now empty) restaurant list.
  signup: (input: SignupInput) => Promise<Pick<Restaurant, 'id' | 'name' | 'slug'>>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
