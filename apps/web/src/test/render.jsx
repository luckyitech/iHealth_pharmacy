import { RECORD_ID_PARAM } from '@/features/masters/record-params';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

/**
 * Renders routes with a fresh query cache (no retries) at the given URL.
 *
 * @param {import('react-router').RouteObject[]} routes
 * @param {string} [initialPath]
 */
export function renderRoutes(routes, initialPath = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router, queryClient };
}

/**
 * @param {number} status
 * @param {unknown} body
 * @returns {Response}
 */
export const jsonResponse = (status, body) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * A fetch stub that answers by "METHOD path" (path relative to /api/v1).
 *
 * @param {Record<string, (request: Request) => Response | Promise<Response>>} handlers
 */
export function stubApi(handlers) {
  /** @type {Request[]} */
  const calls = [];
  const fetch = async (/** @type {Request} */ input) => {
    const request = input instanceof Request ? input : new Request(input);
    calls.push(request);
    const path = new URL(request.url).pathname.replace(/^\/api\/v1\//, '');
    const handler = handlers[`${request.method} ${path}`];
    if (!handler)
      return jsonResponse(404, { error: { code: 'NOT_FOUND', message: `No stub for ${path}` } });
    return handler(request);
  };
  return { fetch, calls };
}

/**
 * The list, "new" and "edit" routes of a master edited on its own page, as the app's router has them.
 *
 * @param {string} path e.g. `/masters/items`
 * @param {React.ReactNode} list
 * @param {React.ReactNode} editor
 * @returns {import('react-router').RouteObject[]}
 */
export function recordPageRoutes(path, list, editor) {
  return [
    { path, element: list },
    { path: `${path}/new`, element: editor },
    { path: `${path}/:${RECORD_ID_PARAM}/edit`, element: editor },
  ];
}
