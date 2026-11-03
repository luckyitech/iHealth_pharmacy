import { useEffect } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

import { Button } from '@/components/ui/button';

import { PageState } from './page-state.jsx';

/**
 * Last-resort screen when rendering fails outside the router.
 *
 * @param {import('react-error-boundary').FallbackProps} props
 * @returns {React.JSX.Element}
 */
export function AppErrorFallback({ error, resetErrorBoundary }) {
  return (
    <main className="flex min-h-svh items-center justify-center">
      <PageState state="error" error={error} onRetry={resetErrorBoundary} />
    </main>
  );
}

/**
 * Shown in place of a route that failed to load or render. The rest of the shell keeps working.
 *
 * @returns {React.JSX.Element}
 */
export function RouteErrorFallback() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  useEffect(() => {
    // A failed lazy chunk after a deployment is fixed by a reload; everything else is shown as-is.
    if (error instanceof TypeError && /dynamically imported module/i.test(error.message))
      window.location.reload();
  }, [error]);

  if (notFound) return <NotFoundPage />;
  return <PageState state="error" error={error} onRetry={() => window.location.reload()} />;
}

/**
 * @returns {React.JSX.Element}
 */
export function NotFoundPage() {
  return (
    <PageState
      state="empty"
      title="Page not found"
      description="The page you are looking for does not exist or has moved."
      action={
        <Button asChild>
          <Link to="/">Go to the dashboard</Link>
        </Button>
      }
    />
  );
}

/**
 * @returns {React.JSX.Element}
 */
export function ForbiddenPage() {
  return (
    <PageState
      state="empty"
      title="You do not have access to this page"
      description="Ask your administrator to grant you the permission you need."
      action={
        <Button asChild variant="outline">
          <Link to="/">Go to the dashboard</Link>
        </Button>
      }
    />
  );
}
