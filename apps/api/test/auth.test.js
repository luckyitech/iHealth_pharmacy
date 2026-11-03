import { PERMISSIONS } from '@ihealth/shared/permissions';
import { SignJWT } from 'jose';
import pino from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createAuthModule } from '../src/features/auth/auth.module.js';
import { defineRoute } from '../src/http/define-route.js';
import { loadConfig } from '../src/config/env.js';
import { createMemoryAuthRepository, SEED } from './fakes/memory-auth-repository.js';
import { createMemoryCounters } from './fakes/memory-counters.js';
import { buildTestApp, TEST_ENV, TEST_SECRET } from './helpers.js';

const config = loadConfig(TEST_ENV);

const salesRoute = defineRoute({
  method: 'post',
  path: '/test/sales',
  summary: 'Needs Sales Billing Submission',
  tags: ['Test'],
  permissions: [PERMISSIONS.SALES_SALES_BILLING_SUBMISSION],
  responses: { 200: { description: 'OK', schema: z.object({ data: z.literal('sold') }) } },
  handler: () => ({ data: 'sold' }),
});

const mastersRoute = defineRoute({
  method: 'get',
  path: '/test/masters',
  summary: 'Needs Masters Entry',
  tags: ['Test'],
  permissions: [PERMISSIONS.MASTER_MASTERS_ENTRY],
  responses: { 200: { description: 'OK', schema: z.object({ data: z.literal('ok') }) } },
  handler: () => ({ data: 'ok' }),
});

/** @type {ReturnType<typeof createMemoryAuthRepository>} */
let repository;
/** @type {{ action: string, outcome: string }[]} */
let auditEntries;
/** @type {import('express').Express} */
let app;

beforeEach(() => {
  repository = createMemoryAuthRepository();
  auditEntries = [];
  const prisma = /** @type {import('@ihealth/db').PrismaClient} */ (
    /** @type {unknown} */ ({
      $queryRaw: async () => [{ 1: 1 }],
      $executeRaw: async (
        /** @type {TemplateStringsArray} */ _sql,
        /** @type {unknown[]} */ ...values
      ) => {
        auditEntries.push({ action: String(values[2]), outcome: String(values[3]) });
        return 1;
      },
    })
  );
  const auth = createAuthModule({
    config,
    prisma,
    counters: createMemoryCounters(),
    logger: pino({ level: 'silent' }),
    repository,
  });
  app = buildTestApp({
    prisma,
    routes: [...auth.routes, salesRoute, mastersRoute],
    guards: auth.guards,
    apiRateLimit: auth.apiRateLimit,
  });
});

/**
 * @param {{ username: string, password: string }} account
 */
async function signIn(account) {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/v1/auth/login')
    .send({ username: account.username, password: account.password });
  return { agent, response, csrfToken: /** @type {string} */ (response.body.data?.csrfToken) };
}

/**
 * @param {import('supertest').Response} response
 * @returns {string[]}
 */
const cookiesOf = (response) =>
  /** @type {string[]} */ (/** @type {unknown} */ (response.headers['set-cookie'] ?? []));

describe('POST /auth/login', () => {
  it('signs in with a legacy BCrypt password and returns the user', async () => {
    const { response } = await signIn(SEED.admin);
    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({
      employeeId: 1,
      username: 'test.admin',
      firstName: 'Ada',
    });
    expect(response.body.data.csrfToken).toEqual(expect.any(String));
  });

  it('sets httpOnly, SameSite=Strict session cookies and never returns tokens in the body', async () => {
    const { response } = await signIn(SEED.admin);
    const cookies = cookiesOf(response);
    for (const name of ['ihealth_access', 'ihealth_refresh', 'ihealth_session']) {
      const cookie = cookies.find((value) => value.startsWith(`${name}=`));
      expect(cookie, name).toMatch(/HttpOnly/);
      expect(cookie, name).toMatch(/SameSite=Strict/);
    }
    expect(cookies.find((value) => value.startsWith('ihealth_refresh='))).toMatch(
      /Path=\/api\/v1\/auth/,
    );
    expect(JSON.stringify(response.body)).not.toMatch(/eyJ/);
  });

  it('upgrades a legacy password to argon2id without touching the legacy value', async () => {
    const legacyBefore = repository.state.credentials[0].legacyPassword;
    await signIn(SEED.admin);
    expect(repository.state.upgraded.get(1)?.hash).toMatch(/^\$argon2id\$/);
    expect(repository.state.credentials[0].legacyPassword).toBe(legacyBefore);
    expect(auditEntries.map((entry) => entry.action)).toContain('auth.password_upgraded');

    const second = await signIn(SEED.admin);
    expect(second.response.status).toBe(200);
  });

  it('accepts and upgrades plain-text legacy passwords', async () => {
    const { response } = await signIn(SEED.cashier);
    expect(response.status).toBe(200);
    expect(repository.state.upgraded.get(2)?.hash).toMatch(/^\$argon2id\$/);
  });

  it('follows a password changed later in the legacy system', async () => {
    await signIn(SEED.cashier);
    repository.state.credentials[1].legacyPassword = 'Changed-In-Legacy-1';
    expect((await signIn(SEED.cashier)).response.status).toBe(401);
    expect(
      (await signIn({ ...SEED.cashier, password: 'Changed-In-Legacy-1' })).response.status,
    ).toBe(200);
  });

  it('gives the same answer for an unknown user and a wrong password', async () => {
    const unknown = await signIn({ username: 'nobody', password: 'x' });
    const wrong = await signIn({ ...SEED.admin, password: 'wrong' });
    expect(unknown.response.status).toBe(401);
    expect(wrong.response.status).toBe(401);
    expect(unknown.response.body.error.message).toBe(wrong.response.body.error.message);
  });

  it('locks the username after five failures, even for the right password', async () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect((await signIn({ ...SEED.admin, password: 'wrong' })).response.status).toBe(401);
    }
    const fifth = await signIn({ ...SEED.admin, password: 'wrong' });
    expect(fifth.response.status).toBe(423);
    expect(Number(fifth.response.headers['retry-after'])).toBeGreaterThan(0);

    const correct = await signIn(SEED.admin);
    expect(correct.response.status).toBe(423);
    expect(correct.response.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('reports an inactive account only after a correct password', async () => {
    expect((await signIn({ ...SEED.inactive, password: 'wrong' })).response.status).toBe(401);
    const correct = await signIn(SEED.inactive);
    expect(correct.response.status).toBe(403);
    expect(correct.response.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('refuses accounts that use two-factor sign-in', async () => {
    repository.state.credentials[0].twoFactorEnabled = true;
    const { response } = await signIn(SEED.admin);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('TWO_FACTOR_REQUIRED');
  });

  it('validates the body', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({ username: ' ' });
    expect(response.status).toBe(400);
    expect(response.body.error.details.map((/** @type {{ path: string }} */ d) => d.path)).toEqual([
      'body.username',
      'body.password',
    ]);
  });
});

describe('authenticated requests', () => {
  it('rejects requests without a session', async () => {
    const response = await request(app).get('/api/v1/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the current user with roles and effective permissions', async () => {
    const { agent } = await signIn(SEED.cashier);
    const response = await agent.get('/api/v1/auth/me');
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      employeeId: 2,
      roles: [{ roleId: 2, name: 'CASHIER', pharmacyBranchId: 1 }],
      permissionIds: [6, 8],
    });
  });

  it('reports an expired access token as SESSION_EXPIRED', async () => {
    const expired = await new SignJWT({ cid: 1, fam: 'f' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('1')
      .setIssuer('ihealth-api')
      .setAudience('ihealth-web')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(TEST_SECRET));
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `ihealth_access=${expired}`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('rejects a token signed with another key', async () => {
    const forged = await new SignJWT({ cid: 1, fam: 'f' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('1')
      .setIssuer('ihealth-api')
      .setAudience('ihealth-web')
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('another-secret-that-is-long-enough-000000'));
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `ihealth_access=${forged}`);
    expect(response.status).toBe(401);
  });
});

describe('CSRF protection', () => {
  it('rejects a state-changing request without the CSRF header', async () => {
    const { agent } = await signIn(SEED.cashier);
    const response = await agent.post('/api/v1/test/sales');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });

  it('rejects a token from another session', async () => {
    const first = await signIn(SEED.cashier);
    const second = await signIn(SEED.admin);
    const response = await first.agent
      .post('/api/v1/test/sales')
      .set('x-csrf-token', second.csrfToken);
    expect(response.status).toBe(403);
  });

  it('accepts the token issued at sign-in and a re-issued one', async () => {
    const { agent, csrfToken } = await signIn(SEED.cashier);
    expect((await agent.post('/api/v1/test/sales').set('x-csrf-token', csrfToken)).status).toBe(
      200,
    );
    const fresh = await agent.get('/api/v1/auth/csrf');
    expect(
      (await agent.post('/api/v1/test/sales').set('x-csrf-token', fresh.body.data.csrfToken))
        .status,
    ).toBe(200);
  });
});

describe('permissions', () => {
  it('allows a route when the permission is granted', async () => {
    const { agent, csrfToken } = await signIn(SEED.cashier);
    expect((await agent.post('/api/v1/test/sales').set('x-csrf-token', csrfToken)).status).toBe(
      200,
    );
  });

  it('denies and audits a route without the permission', async () => {
    const { agent } = await signIn(SEED.cashier);
    const response = await agent.get('/api/v1/test/masters');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(auditEntries).toContainEqual({ action: 'auth.permission_denied', outcome: 'denied' });
  });

  it('applies a revoked grant on the next request', async () => {
    const { agent, csrfToken } = await signIn(SEED.cashier);
    repository.state.grants.set(2, new Set([8]));
    expect((await agent.post('/api/v1/test/sales').set('x-csrf-token', csrfToken)).status).toBe(
      403,
    );
  });
});

describe('refresh and logout', () => {
  it('rotates the refresh token', async () => {
    const { agent } = await signIn(SEED.cashier);
    const response = await agent.post('/api/v1/auth/refresh');
    expect(response.status).toBe(200);
    expect(response.body.data.csrfToken).toEqual(expect.any(String));
    expect(repository.state.tokens).toHaveLength(2);
    expect(repository.state.tokens[0].revokedReason).toBe('ROTATED');
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
  });

  it('revokes the whole sign-in when an old refresh token is reused', async () => {
    const { agent, response: login } = await signIn(SEED.cashier);
    const stolen = cookiesOf(login)
      .find((value) => value.startsWith('ihealth_refresh='))
      ?.split(';')[0];
    await agent.post('/api/v1/auth/refresh');

    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', String(stolen));
    expect(replay.status).toBe(401);
    expect(repository.state.tokens.every((token) => token.revokedAt)).toBe(true);
    expect(auditEntries).toContainEqual({ action: 'auth.refresh_reuse', outcome: 'denied' });
    expect((await agent.post('/api/v1/auth/refresh')).status).toBe(401);
  });

  it('rejects a missing refresh token', async () => {
    const response = await request(app).post('/api/v1/auth/refresh');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('signs out: revokes the family and clears the cookies', async () => {
    const { agent, csrfToken } = await signIn(SEED.cashier);
    const response = await agent.post('/api/v1/auth/logout').set('x-csrf-token', csrfToken);
    expect(response.status).toBe(204);
    expect(cookiesOf(response).every((cookie) => /Expires=Thu, 01 Jan 1970/.test(cookie))).toBe(
      true,
    );
    expect(repository.state.tokens.every((token) => token.revokedReason === 'LOGOUT')).toBe(true);
    expect((await agent.post('/api/v1/auth/refresh')).status).toBe(401);
  });
});

describe('POST /auth/approval-pin/verify', () => {
  it("accepts the approver's PIN", async () => {
    const { agent, csrfToken } = await signIn(SEED.cashier);
    const response = await agent
      .post('/api/v1/auth/approval-pin/verify')
      .set('x-csrf-token', csrfToken)
      .send({ username: SEED.admin.username, pin: SEED.admin.pin, action: 'sales_return' });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ approverEmployeeId: 1, approverName: 'Ada Admin' });
    expect(auditEntries).toContainEqual({ action: 'auth.approval_pin', outcome: 'success' });
  });

  it('rejects a wrong PIN and locks the approver after five tries', async () => {
    const { agent, csrfToken } = await signIn(SEED.cashier);
    const attempt = () =>
      agent
        .post('/api/v1/auth/approval-pin/verify')
        .set('x-csrf-token', csrfToken)
        .send({ username: SEED.admin.username, pin: '0000' });
    for (let i = 0; i < 5; i += 1) expect((await attempt()).status).toBe(403);
    const locked = await attempt();
    expect(locked.status).toBe(423);
  });

  it('rejects an approver without a PIN', async () => {
    const { agent, csrfToken } = await signIn(SEED.admin);
    const response = await agent
      .post('/api/v1/auth/approval-pin/verify')
      .set('x-csrf-token', csrfToken)
      .send({ username: SEED.cashier.username, pin: '1234' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('APPROVAL_PIN_INVALID');
  });
});
