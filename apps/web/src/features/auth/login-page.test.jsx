import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setCsrfToken } from '@/lib/csrf-token';
import { jsonResponse, renderRoutes, stubApi } from '@/test/render';

import LoginPage from './login-page.jsx';
import { safeRedirect } from './safe-redirect.js';

const USER = {
  employeeId: 2,
  username: 'test.cashier',
  firstName: 'Carl',
  lastName: 'Cashier',
  email: null,
  pharmacyId: 1,
  roles: [],
  permissionIds: [6],
};

const signedOut = () =>
  jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' } });

/**
 * @param {Record<string, (request: Request) => Response | Promise<Response>>} handlers
 */
function setup(handlers) {
  const api = stubApi({ 'GET auth/me': signedOut, ...handlers });
  vi.stubGlobal('fetch', api.fetch);
  const view = renderRoutes(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/sales', element: <p>Sales page</p> },
      { path: '/', element: <p>Dashboard</p> },
    ],
    '/login?redirect=%2Fsales',
  );
  return { ...view, api };
}

beforeEach(() => setCsrfToken(null));
afterEach(() => vi.unstubAllGlobals());

describe('LoginPage', () => {
  it('shows inline validation messages and does not call the API', async () => {
    const { api } = setup({});
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your username')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    expect(api.calls.some((request) => request.url.endsWith('auth/login'))).toBe(false);
  });

  it('signs in and continues to the page the user asked for', async () => {
    setup({
      'POST auth/login': async (request) => {
        expect(await request.json()).toEqual({ username: 'test.cashier', password: 'secret pass' });
        return jsonResponse(200, { data: { user: USER, csrfToken: 'csrf-1' } });
      },
    });
    await userEvent.type(await screen.findByLabelText('Username'), '  test.cashier ');
    await userEvent.type(screen.getByLabelText('Password'), 'secret pass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Sales page')).toBeInTheDocument();
  });

  it('shows the API message when the sign-in is refused', async () => {
    setup({
      'POST auth/login': () =>
        jsonResponse(423, {
          error: {
            code: 'ACCOUNT_LOCKED',
            message: 'Too many failed sign-in attempts. Try again later.',
          },
        }),
    });
    await userEvent.type(await screen.findByLabelText('Username'), 'test.admin');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Account temporarily locked');
    expect(screen.getByRole('alert')).toHaveTextContent('Too many failed sign-in attempts');
  });

  it('lets the user reveal the password', async () => {
    setup({});
    const password = await screen.findByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    await waitFor(() => expect(password).toHaveAttribute('type', 'text'));
  });
});

describe('safeRedirect', () => {
  it('only follows paths inside the app', () => {
    expect(safeRedirect('/sales?x=1')).toBe('/sales?x=1');
    expect(safeRedirect('//evil.example')).toBe('/');
    expect(safeRedirect('https://evil.example')).toBe('/');
    expect(safeRedirect(null)).toBe('/');
  });
});
