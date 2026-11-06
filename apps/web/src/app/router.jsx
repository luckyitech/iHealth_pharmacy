import { POLICIES } from '@ihealth/shared/permissions';
import { createBrowserRouter } from 'react-router';

import { NotFoundPage, RouteErrorFallback } from '@/components/feedback/error-fallbacks';
import { AppShell } from '@/components/layout/app-shell';
import { CHANGE_PASSWORD_PATH, RequireAuth, RequirePermission } from '@/features/auth/route-guards';

import { MASTERS_AREA_PERMISSIONS } from '@/features/masters/sections';

/** Paths of the short master lists: the item lookups and banks (one page component, configured per list). */
const ITEM_LOOKUP_ROUTES = /** @type {const} */ ([
  'item-categories',
  'item-forms',
  'item-groups',
  'generic-names',
  'specializations',
  'units-of-measure',
  'banks',
]);

import { NAV_ITEMS } from './navigation.js';

/** Modules with screens of their own; the others show a placeholder page until they are built. */
const CUSTOM_MODULES = new Set(['masters', 'sales']);

/**
 * Each page is its own chunk, loaded when first visited.
 * Module pages are guarded by the same permissions that decide whether they appear in the menu.
 *
 * @returns {ReturnType<typeof createBrowserRouter>}
 */
export function createAppRouter() {
  const moduleRoutes = NAV_ITEMS.filter(
    (item) => item.path !== '/' && !CUSTOM_MODULES.has(item.id),
  ).map((item) => ({
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
  }));

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
                  path: 'sales',
                  element: <RequirePermission permissions={POLICIES.sales.read} />,
                  children: [
                    {
                      index: true,
                      lazy: async () => ({
                        Component: (await import('@/features/sales/sales-index')).default,
                      }),
                    },
                    {
                      path: 'new',
                      element: <RequirePermission permissions={POLICIES.sales.sell} />,
                      children: [
                        {
                          index: true,
                          lazy: async () => ({
                            Component: (await import('@/features/sales/till/sales-screen-page'))
                              .default,
                          }),
                        },
                      ],
                    },
                    {
                      path: 'approvals',
                      element: <RequirePermission permissions={POLICIES.sales.approve} />,
                      children: [
                        {
                          index: true,
                          lazy: async () => ({
                            Component: (await import('@/features/sales/approvals/approvals-page'))
                              .default,
                          }),
                        },
                      ],
                    },
                    {
                      path: 'history',
                      lazy: async () => ({
                        Component: (await import('@/features/sales/history/sales-history-page'))
                          .default,
                      }),
                    },
                  ],
                },
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
                    {
                      path: 'medicine-types',
                      lazy: async () => ({
                        Component: (
                          await import('@/features/masters/medicine-types/medicine-types-page')
                        ).default,
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
