import type { ReactNode } from 'react';
import type { UserRole } from '@ar-menu/shared';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export function ProtectedRoute({
  children,
  role,
}: {
  children: ReactNode;
  /** Restricts the route to a single role — e.g. the admin QA queue. The
   * server enforces this too (RolesGuard); this is only about not showing
   * an owner a page whose every request will 403. */
  role?: UserRole;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="page-loading">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (role && user.role !== role) {
    return <Navigate to="/restaurants" replace />;
  }
  return <>{children}</>;
}
