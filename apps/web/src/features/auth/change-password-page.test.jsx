import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, renderRoutes, stubApi } from '@/test/render';

import ChangePasswordPage from './change-password-page.jsx';
import { RequireAuth } from './route-guards.jsx';

const USER = {
  employeeId: 2,
  username: 'test.cashier',
  firstName: 'Test',
  lastName: 'Cashier',
  email: null,
  pharmacyId: 1,
  roles: [],
  permissionIds: [],
};

/**
 * @param {boolean} mustChangePassword
 */
function setup(mustChangePassword) {
  /** @type {unknown[]} */
  const changes = [];
  let required = mustChangePassword;
  const api = stubApi({
    'GET auth/csrf': () => jsonResponse(200, { data: { csrfToken: 'token' } }),
    'GET auth/me': () => jsonResponse(200, { data: { ...USER, mustChangePassword: required } }),
    'GET app-info': () =>
      jsonResponse(200, { data: { apiVersion: 'v1', pharmacy: null, region: null } }),
    'POST auth/change-password': async (request) => {
      changes.push(await request.json());
      required = false;
      return jsonResponse(200, { data: { csrfToken: 'renewed' } });
    },
  });
  vi.stubGlobal('fetch', api.fetch);
  const view = renderRoutes(
    [
      {
        element: <RequireAuth />,
        children: [
          { path: '/change-password', element: <ChangePasswordPage /> },
          { path: '/sales', element: <h1>Sales</h1> },
        ],
      },
    ],
    '/sales',
  );
  return { ...view, changes };
}

afterEach(() => vi.unstubAllGlobals());

describe('ChangePasswordPage', () => {
  it('sends a user with a temporary password here first, then back where they were going', async () => {
    const { changes, router } = setup(true);
    expect(
      await screen.findByRole('heading', { name: 'Choose a new password' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/change-password');

    await userEvent.type(screen.getByLabelText('Temporary password'), 'Temporary-Pass-1');
    await userEvent.type(screen.getByLabelText('New password'), 'My-Own-Pass-2026');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'My-Own-Pass-2026');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => expect(changes).toHaveLength(1));
    expect(changes[0]).toEqual({
      currentPassword: 'Temporary-Pass-1',
      newPassword: 'My-Own-Pass-2026',
    });
    expect(await screen.findByRole('heading', { name: 'Sales' })).toBeInTheDocument();
  });

  it('does not redirect users who have chosen their own password', async () => {
    setup(false);
    expect(await screen.findByRole('heading', { name: 'Sales' })).toBeInTheDocument();
  });
});
