import type { ReactNode } from 'react';
import { UserRole } from '@ar-menu/shared';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/restaurants" className="app-logo">
          <img src="/logo.svg" alt="" width="28" height="28" className="app-logo-mark" />
          AR Menu
        </Link>
        {user && (
          <div className="app-header-user">
            {user.role === UserRole.ADMIN && <Link to="/admin/qa-queue">QA queue</Link>}
            <span className="muted">{user.email}</span>
            <button type="button" className="link-button" onClick={() => void handleLogout()}>
              Log out
            </button>
          </div>
        )}
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
