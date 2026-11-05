import { createBrowserRouter } from 'react-router';

import { NotFoundPage, RouteErrorFallback } from '@/components/feedback/error-fallbacks';
import { AppShell } from '@/components/layout/app-shell';
import { RequireAuth, RequirePermission } from '@/features/auth/route-guards';

import { MASTERS_AREA_PERMISSIONS } from '@/features/masters/sections';

import { NAV_ITEMS } from './navigation.js';

/**
 * Each page is its own chunk, loaded when first visited.
 * Module pages are guarded by the same permissions that decide whether they appear in the menu.
 *
 * @returns {ReturnType<typeof createBrowserRouter>}
 */
export function createAppRouter() {
  const moduleRoutes = NAV_ITEMS.filter((item) => item.path !== '/' && item.id !== 'masters').map(
    (item) => ({
      path: item.path.slice(1),
      element: <RequirePermission permissions={item.permissions} />,
      children: [
        {
          index: true,
          lazy: async () => {
            const { default: ModulePage } = await import('@/features/modules/module-page');
            return { Component: () => <ModulePage item={item} /> };
          },
        },
      ],
    }),
  );

  return createBrowserRouter([
    {
      path: '/login',
      errorElement: <RouteErrorFallback />,
      lazy: async () => ({ Component: (await import('@/features/auth/login-page')).default }),
    },
    {
      path: '/forgot-password',
      errorElement: <RouteErrorFallback />,
      lazy: async () => ({
        Component: (await import('@/features/auth/forgot-password-page')).default,
      }),
    },
    {
      path: '/reset-password',
      errorElement: <RouteErrorFallback />,
      lazy: async () => ({
        Component: (await import('@/features/auth/reset-password-page')).default,
      }),
    },
    {
      element: <RequireAuth />,
      errorElement: <RouteErrorFallback />,
      children: [
        {
          element: <AppShell />,
          children: [
            {
              errorElement: <RouteErrorFallback />,
              children: [
                {
                  index: true,
                  lazy: async () => ({
                    Component: (await import('@/features/dashboard/dashboard-page')).default,
                  }),
                },
                ...moduleRoutes,
                {
                  path: 'masters',
                  element: <RequirePermission permissions={MASTERS_AREA_PERMISSIONS} />,
                  children: [
                    {
                      lazy: async () => ({
                        Component: (await import('@/features/masters/masters-layout')).default,
                      }),
                      children: [
                        {
                          index: true,
                          lazy: async () => ({
                            Component: (await import('@/features/masters/masters-index')).default,
                          }),
                        },
                        {
                          path: 'manufacturers',
                          lazy: async () => ({
                            Component: (
                              await import('@/features/masters/manufacturers/manufacturers-page')
                            ).default,
                          }),
                        },
                      ],
                    },
                  ],
                },
                { path: '*', element: <NotFoundPage /> },
              ],
            },
          ],
        },
      ],
    },
  ]);
}
