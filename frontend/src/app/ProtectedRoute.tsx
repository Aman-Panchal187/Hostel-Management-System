import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { HOME_BY_ROLE, useAuth } from '@/features/auth/AuthContext';
import type { Role } from '@/types';

export function FullPageLoader() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-6" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-32" />
    </div>
  );
}

/** UX guard only. Authorization is enforced by the API on every request. */
export function ProtectedRoute({ roles }: Readonly<{ roles?: Role[] }>) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  return <Outlet />;
}

export function RoleHomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  return <Navigate to={user ? HOME_BY_ROLE[user.role] : '/login'} replace />;
}
