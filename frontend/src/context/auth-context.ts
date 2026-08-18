import { createContext } from 'react';
import type { PublicUser } from '../api/types';

export interface AuthContextValue {
  user: PublicUser | null;
  /** True until the initial silent-refresh attempt (on load) resolves. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
