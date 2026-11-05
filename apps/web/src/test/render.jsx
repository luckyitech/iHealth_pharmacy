import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

import { Toaster } from '@/components/ui/sonner';

/**
 * Renders routes with a fresh query cache (no retries) at the given URL, with the app's notifications.
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
      <Toaster theme="light" />
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
 * Answers the "Save these changes?" / "Create this ...?" question with its confirm button.
 *
 * @returns {Promise<HTMLElement>} The confirmation dialog.
 */
export async function confirmChange() {
  const { screen, within } = await import('@testing-library/react');
  const { default: userEvent } = await import('@testing-library/user-event');
  const dialog = await screen.findByRole('alertdialog');
  const buttons = within(dialog).getAllByRole('button');
  await userEvent.click(buttons[buttons.length - 1]);
  return dialog;
}
