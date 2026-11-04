import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, renderRoutes, stubApi } from '@/test/render';

import ForgotPasswordPage from './forgot-password-page.jsx';
import LoginPage from './login-page.jsx';
import ResetPasswordPage from './reset-password-page.jsx';

const SAME_ANSWER =
  'If that account exists and has a work email, we have sent it a reset link. It expires in 30 minutes.';
const signedOut = () =>
  jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } });

/**
 * @param {string} path
 * @param {Record<string, (request: Request) => Response | Promise<Response>>} handlers
 */
function setup(path, handlers) {
  const api = stubApi({ 'GET auth/me': signedOut, ...handlers });
  vi.stubGlobal('fetch', api.fetch);
  renderRoutes(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
    ],
    path,
  );
  return api;
}

afterEach(() => vi.unstubAllGlobals());

describe('ForgotPasswordPage', () => {
  it('is reachable from the sign-in page', async () => {
    setup('/login', {});
    await userEvent.click(await screen.findByRole('link', { name: 'Forgot your password?' }));
    expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
  });

  it('sends the identifier and shows the same neutral answer', async () => {
    setup('/forgot-password', {
      'POST auth/forgot-password': async (request) => {
        expect(await request.json()).toEqual({ identifier: 'carl@example.test' });
        return jsonResponse(200, { data: { message: SAME_ANSWER } });
      },
    });
    await userEvent.type(await screen.findByLabelText('Email or username'), ' carl@example.test ');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('status')).toHaveTextContent(SAME_ANSWER);
    expect(screen.getByText(/ask your administrator/)).toBeInTheDocument();
  });

  it('asks for an identifier first', async () => {
    const api = setup('/forgot-password', {});
    await userEvent.click(await screen.findByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('Enter your email or username')).toBeInTheDocument();
    expect(api.calls.some((request) => request.url.endsWith('forgot-password'))).toBe(false);
  });
});

describe('ResetPasswordPage', () => {
  /**
   * @param {string} password
   * @param {string} [confirm]
   */
  const fill = async (password, confirm = password) => {
    await userEvent.type(await screen.findByLabelText('New password'), password);
    await userEvent.type(screen.getByLabelText('Confirm new password'), confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
  };

  it('checks length and confirmation before calling the API', async () => {
    setup('/reset-password?token=abc', {});
    await fill('short', 'other');
    expect(await screen.findByText('Use at least 10 characters')).toBeInTheDocument();
    expect(screen.getByText('The passwords do not match')).toBeInTheDocument();
  });

  it('changes the password and returns to sign in with a note', async () => {
    setup('/reset-password?token=abc', {
      'POST auth/reset-password': async (request) => {
        expect(await request.json()).toEqual({ token: 'abc', password: 'a-brand-new-password' });
        return jsonResponse(204, null);
      },
    });
    await fill('a-brand-new-password');
    expect(await screen.findByText(/Your password has been changed\./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('explains an expired link and offers a new one', async () => {
    setup('/reset-password?token=old', {
      'POST auth/reset-password': () =>
        jsonResponse(400, {
          error: {
            code: 'RESET_TOKEN_INVALID',
            message: 'This reset link is invalid or has expired. Request a new one.',
          },
        }),
    });
    await fill('a-brand-new-password');
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired');
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('shows the API reason on the field when the password is the username', async () => {
    setup('/reset-password?token=abc', {
      'POST auth/reset-password': () =>
        jsonResponse(400, {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Some fields are invalid.',
            details: [
              {
                path: 'body.password',
                message: 'Choose a password that is not your username or email',
              },
            ],
          },
        }),
    });
    await fill('test.cashier-1');
    expect(
      await screen.findByText('Choose a password that is not your username or email'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('handles a missing token', async () => {
    setup('/reset-password', {});
    expect(await screen.findByRole('heading', { name: 'Reset link missing' })).toBeInTheDocument();
  });
});
