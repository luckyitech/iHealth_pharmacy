import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, onSessionEnded } from './api-client.js';

/**
 * @param {number} status
 * @param {unknown} body
 * @returns {Response}
 */
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const SIGNED_OUT = { error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' } };
const EXPIRED = { error: { code: 'SESSION_EXPIRED', message: 'Your session has expired.' } };

/**
 * A fake API: `renewed` decides whether the refresh works; reads succeed once it has.
 *
 * @param {{ renewed: boolean, first: unknown }} options
 */
function stubApi({ renewed, first }) {
  let signedIn = false;
  let refreshes = 0;
  const fetch = vi.fn(async (/** @type {Request} */ input) => {
    const request = input instanceof Request ? input : new Request(input);
    const path = new URL(request.url).pathname;
    if (path.endsWith('auth/refresh')) {
      refreshes += 1;
      // Slow enough for the other requests to arrive while it runs.
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (!renewed) return json(401, EXPIRED);
      signedIn = true;
      return json(200, { data: { csrfToken: 'renewed' } });
    }
    return signedIn ? json(200, { data: path }) : json(401, first);
  });
  vi.stubGlobal('fetch', fetch);
  return { refreshes: () => refreshes };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the API client', () => {
  it('renews a sign-in whose access cookie the browser dropped, and retries the request', async () => {
    stubApi({ renewed: true, first: SIGNED_OUT });
    expect(await api.get('sales/cashiers').json()).toEqual({ data: '/api/v1/sales/cashiers' });
  });

  it('renews once for requests that fail together, then retries each', async () => {
    const server = stubApi({ renewed: true, first: EXPIRED });
    const [bills, cashiers] = await Promise.all([
      api.get('sales/bills').json(),
      api.get('sales/cashiers').json(),
    ]);
    expect([bills, cashiers]).toEqual([
      { data: '/api/v1/sales/bills' },
      { data: '/api/v1/sales/cashiers' },
    ]);
    expect(server.refreshes()).toBe(1);
  });

  it('ends the session only when renewing fails', async () => {
    stubApi({ renewed: false, first: SIGNED_OUT });
    const ended = vi.fn();
    const stop = onSessionEnded(ended);
    await expect(api.get('sales/bills').json()).rejects.toMatchObject({ status: 401 });
    expect(ended).toHaveBeenCalled();
    stop();
  });
});
