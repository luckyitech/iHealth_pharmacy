import { createBrowserRouter } from 'react-router';

import { NotFoundPage, RouteErrorFallback } from '@/components/feedback/error-fallbacks';
import { AppShell } from '@/components/layout/app-shell';
import { CHANGE_PASSWORD_PATH, RequireAuth, RequirePermission } from '@/features/auth/route-guards';

import { MASTERS_AREA_PERMISSIONS } from '@/features/masters/sections';

/** Paths of the item-master lookup pages (one page component, configured per lookup). */
const ITEM_LOOKUP_ROUTES = /** @type {const} */ ([
  'item-categories',
  'item-forms',
  'item-groups',
  'generic-names',
  'specializations',
  'units-of-measure',
]);

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
          path: CHANGE_PASSWORD_PATH,
          lazy: async () => ({
            Component: (await import('@/features/auth/change-password-page')).default,
          }),
        },
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
                      index: true,
                      lazy: async () => ({
                        Component: (await import('@/features/masters/masters-index')).default,
                      }),
                    },
                    {
                      path: 'items',
                      lazy: async () => ({
                        Component: (await import('@/features/masters/items/items-page')).default,
                      }),
                    },
                    ...ITEM_LOOKUP_ROUTES.map((lookup) => ({
                      path: lookup,
                      lazy: async () => {
                        const { default: ItemLookupPage } =
                          await import('@/features/masters/item-lookups/item-lookup-pages');
                        return { Component: () => <ItemLookupPage lookup={lookup} /> };
                      },
                    })),
                    {
                      path: 'pharmacy-profile',
                      lazy: async () => ({
                        Component: (
                          await import('@/features/masters/organisation/pharmacy-profile-page')
                        ).default,
                      }),
                    },
                    {
                      path: 'terms',
                      lazy: async () => ({
                        Component: (await import('@/features/masters/organisation/terms-page'))
                          .default,
                      }),
                    },
                    {
                      path: 'hospitals',
                      lazy: async () => ({
                        Component: (await import('@/features/masters/organisation/hospitals-page'))
                          .default,
                      }),
                    },
                    {
                      path: 'providers',
                      lazy: async () => ({
                        Component: (await import('@/features/masters/organisation/providers-page'))
                          .default,
                      }),
                    },
                    {
                      path: 'employees',
                      lazy: async () => ({
                        Component: (await import('@/features/masters/employees/employees-page'))
                          .default,
                      }),
                    },
                    {
                      path: 'customers',
                      lazy: async () => ({
                        Component: (await import('@/features/masters/customers/customers-page'))
                          .default,
                      }),
                    },
                    {
                      path: 'suppliers',
                      lazy: async () => ({
                        Component: (await import('@/features/masters/suppliers/suppliers-page'))
                          .default,
                      }),
                    },
                    {
                      path: 'item-suppliers',
                      lazy: async () => ({
                        Component: (
                          await import('@/features/masters/item-suppliers/item-suppliers-page')
                        ).default,
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
                { path: '*', element: <NotFoundPage /> },
              ],
            },
          ],
        },
      ],
    },
  ]);
}

// The route list is read once, when the app starts. In development a change to it (for example
// after switching branches) reloads the page, so an open tab never keeps routing with old routes.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());
