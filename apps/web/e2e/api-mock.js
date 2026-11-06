/**
 * A small in-memory stand-in for /api/v1/auth, so the smoke test needs no database.
 * It follows the real contract: cookies for the session, a CSRF token for writes, the shared error shape.
 */

export const CASHIER = Object.freeze({
  employeeId: 2,
  username: 'test.cashier',
  password: 'Test-Cashier-Pass-1',
  firstName: 'Carl',
  lastName: 'Cashier',
  email: 'cashier@example.test',
  pharmacyId: 1,
  roles: [{ roleId: 2, name: 'CASHIER', pharmacyBranchId: 1 }],
  // Sales Billing Submission, Sales Return Approval
  permissionIds: [6, 8],
});

const CSRF_TOKEN = 'smoke-csrf-token';
export const RESET_TOKEN = 'smoke-reset-token';
export const FORGOT_PASSWORD_MESSAGE =
  'If that account exists and has a work email, we have sent it a reset link. It expires in 30 minutes.';

/**
 * @param {import('@playwright/test').Page} page
 */
export async function mockApi(page) {
  let signedIn = false;
  const { password, ...user } = CASHIER;

  /**
   * @param {import('@playwright/test').Route} route
   * @param {number} status
   * @param {unknown} [body]
   */
  const reply = (route, status, body) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: body === undefined ? '' : JSON.stringify(body),
    });

  const unauthenticated = {
    error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' },
  };

  // Everything else is answered here too, so a test never reaches a real API (the preview server
  // proxies /api to the developer's running one).
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/', '');
    if (path === 'app-info')
      return reply(route, 200, {
        data: {
          apiVersion: '1',
          pharmacy: { id: 1, name: 'Test Pharmacy', city: null, country: null },
          region: { locale: 'en-KE', currency: 'KES', timeZone: 'Africa/Nairobi' },
        },
      });
    return reply(route, 404, { error: { code: 'NOT_FOUND', message: `No mock for ${path}` } });
  });

  await page.route('**/api/v1/auth/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1/', '');
    const key = `${request.method()} ${path}`;

    if (key === 'POST auth/login') {
      const body = request.postDataJSON();
      /** @type {string[]} */
      const identifiers = [CASHIER.username, CASHIER.email];
      const knownIdentifier = identifiers.includes(String(body.identifier).trim().toLowerCase());
      if (knownIdentifier && body.password === password) {
        signedIn = true;
        return reply(route, 200, { data: { user, csrfToken: CSRF_TOKEN } });
      }
      return reply(route, 401, {
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'The username or password is incorrect. Check them and try again.',
        },
      });
    }
    if (key === 'POST auth/forgot-password') {
      return reply(route, 200, { data: { message: FORGOT_PASSWORD_MESSAGE } });
    }
    if (key === 'POST auth/reset-password') {
      return request.postDataJSON().token === RESET_TOKEN
        ? reply(route, 204)
        : reply(route, 400, {
            error: {
              code: 'RESET_TOKEN_INVALID',
              message: 'This reset link is invalid or has expired. Request a new one.',
            },
          });
    }
    if (key === 'GET auth/me')
      return signedIn ? reply(route, 200, { data: user }) : reply(route, 401, unauthenticated);
    if (key === 'GET auth/csrf')
      return signedIn
        ? reply(route, 200, { data: { csrfToken: CSRF_TOKEN } })
        : reply(route, 401, unauthenticated);
    if (key === 'POST auth/logout') {
      if (request.headers()['x-csrf-token'] !== CSRF_TOKEN) {
        return reply(route, 403, {
          error: { code: 'CSRF_INVALID', message: 'Your session could not be verified.' },
        });
      }
      signedIn = false;
      return reply(route, 204);
    }
    return reply(route, 404, { error: { code: 'NOT_FOUND', message: `No mock for ${key}` } });
  });
}
