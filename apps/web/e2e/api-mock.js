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

  await page.route('**/api/v1/auth/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1/', '');
    const key = `${request.method()} ${path}`;

    if (key === 'POST auth/login') {
      const body = request.postDataJSON();
      if (body.identifier === CASHIER.username && body.password === password) {
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
