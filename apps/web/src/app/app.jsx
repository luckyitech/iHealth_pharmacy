import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';

import { AppErrorFallback } from '@/components/feedback/error-fallbacks';
import { CURRENT_USER_KEY } from '@/features/auth/use-auth';
import { onSessionEnded } from '@/lib/api-client';
import { createQueryClient } from '@/lib/query-client';
import { prefersDark, useThemeStore } from '@/stores/theme-store';

import { createAppRouter } from './router.jsx';

/**
 * Applies the theme preference to <html>, following the device setting when it is "system".
 *
 * @returns {null}
 */
function ThemeSync() {
  const theme = useThemeStore((state) => state.theme);
  useEffect(() => {
    const apply = () => document.documentElement.classList.toggle('dark', prefersDark(theme));
    apply();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return null;
}

/**
 * When the session cannot be renewed, forget the user so the guard returns to the sign-in page.
 *
 * @returns {null}
 */
function SessionWatcher() {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      onSessionEnded(() => {
        queryClient.clear();
        queryClient.setQueryData(CURRENT_USER_KEY, null);
      }),
    [queryClient],
  );
  return null;
}

/**
 * @returns {React.JSX.Element}
 */
export function App() {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createAppRouter);
  const theme = useThemeStore((state) => state.theme);

  return (
    <ErrorBoundary FallbackComponent={AppErrorFallback}>
      <QueryClientProvider client={queryClient}>
        <ThemeSync />
        <SessionWatcher />
        <RouterProvider router={router} />
        <Toaster theme={theme} richColors closeButton position="top-right" />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
