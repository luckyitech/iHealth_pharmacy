import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, renderRoutes, stubApi } from '@/test/render';
import { CURRENT_USER_KEY } from '@/features/auth/use-auth';

import ManufacturersPage from './manufacturers-page.jsx';

const ROWS = [
  { id: 1, name: 'Cipla Kenya', city: 'Nairobi', license: 'L-1', phone: null, active: true },
  { id: 2, name: '', city: null, license: null, phone: null, active: true },
];

/**
 * @param {number[]} permissionIds
 * @param {Record<string, (request: Request) => Response | Promise<Response>>} [handlers]
 */
function setup(permissionIds, handlers = {}) {
  const api = stubApi({
    'GET masters/manufacturers': () =>
      jsonResponse(200, { data: ROWS, meta: { page: 1, pageSize: 25, total: 2, totalPages: 1 } }),
    'GET lookups/countries': () => jsonResponse(200, { data: [] }),
    ...handlers,
  });
  vi.stubGlobal('fetch', api.fetch);
  const view = renderRoutes(
    [{ path: '/masters/manufacturers', element: <ManufacturersPage /> }],
    '/masters/manufacturers',
  );
  view.queryClient.setQueryData(CURRENT_USER_KEY, {
    employeeId: 1,
    firstName: 'A',
    lastName: 'B',
    roles: [],
    permissionIds,
  });
  return { ...view, api };
}

afterEach(() => vi.unstubAllGlobals());

describe('ManufacturersPage', () => {
  it('lists records, marks unnamed ones and asks the API for active records sorted by name', async () => {
    const { api } = setup([1]);
    expect(await screen.findByText('Cipla Kenya')).toBeInTheDocument();
    expect(screen.getByText('Unnamed')).toBeInTheDocument();
    expect(screen.getByText('1–2 of 2')).toBeInTheDocument();
    const url = new URL(
      api.calls.find((request) => request.url.includes('masters/manufacturers'))?.url ?? '',
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      sort: 'name',
      status: 'active',
      page: '1',
    });
  });

  it('hides "New manufacturer" without the edit permission', async () => {
    setup([900001]);
    await screen.findByText('Cipla Kenya');
    expect(screen.queryByRole('button', { name: /New manufacturer/ })).not.toBeInTheDocument();
  });

  it('creates a record and shows the API duplicate error on the field', async () => {
    setup([1], {
      'POST masters/manufacturers': () =>
        jsonResponse(409, {
          error: {
            code: 'CONFLICT',
            message: 'A manufacturer with this name already exists',
            details: [
              { path: 'body.name', message: 'A manufacturer with this name already exists' },
            ],
          },
        }),
    });
    await userEvent.click(await screen.findByRole('button', { name: /New manufacturer/ }));
    const panel = await screen.findByRole('dialog');
    await userEvent.type(within(panel).getByLabelText('Name'), 'Cipla Kenya');
    await userEvent.click(within(panel).getByRole('button', { name: 'Create manufacturer' }));
    expect(
      await within(panel).findByText('A manufacturer with this name already exists'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(panel).getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true'),
    );
  });

  it('requires a name before calling the API', async () => {
    const { api } = setup([1]);
    await userEvent.click(await screen.findByRole('button', { name: /New manufacturer/ }));
    const panel = await screen.findByRole('dialog');
    await userEvent.click(within(panel).getByRole('button', { name: 'Create manufacturer' }));
    expect(await within(panel).findByText('This field is required')).toBeInTheDocument();
    expect(api.calls.some((request) => request.method === 'POST')).toBe(false);
  });
});
