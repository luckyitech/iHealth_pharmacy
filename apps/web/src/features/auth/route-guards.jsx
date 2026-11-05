import { Navigate, Outlet, useLocation } from 'react-router';

import { ForbiddenPage } from '@/components/feedback/error-fallbacks';
import { PageState } from '@/components/feedback/page-state';

import { useCurrentUser } from './use-auth.js';
import { usePermissions } from './use-permissions.js';

/**
 * Renders its child routes only for a signed-in user; otherwise sends them to sign in and back.
 *
 * @returns {React.JSX.Element}
 */
export function RequireAuth() {
  const { data: user, isPending, isError, error, refetch } = useCurrentUser();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <PageState state="loading" title="Loading your workspace…" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <PageState state="error" error={error} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (!user) {
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }
  return <Outlet />;
}

/**
 * Shows a clear "no access" page instead of a module the user has no permission for.
 *
 * @param {{ permissions: readonly import('@ihealth/shared/permissions').PermissionDefinition[] }} props
 * @returns {React.JSX.Element}
 */
export function RequirePermission({ permissions }) {
  const { hasAny } = usePermissions();
  return hasAny(permissions) ? <Outlet /> : <ForbiddenPage />;
}
