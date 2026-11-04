import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAuthModule } from '../../src/features/auth/auth.module.js';
import { loadConfig } from '../../src/config/env.js';
import { collectRoutes } from '../../src/routes.js';
import { buildTestApp, TEST_ENV } from '../helpers.js';
import { startTestDatabase } from './database.js';

/** @type {Awaited<ReturnType<typeof startTestDatabase>>} */
let db;
/** @type {import('express').Express} */
let app;
/** @type {import('../../src/infra/mailer.js').MailMessage[]} */
const sentMail = [];

beforeAll(async () => {
  db = await startTestDatabase();
  const config = loadConfig({ ...TEST_ENV, DATABASE_URL: db.url });
  const logger = pino({ level: 'silent' });
  const auth = createAuthModule({
    config,
    prisma: db.prisma,
    counters: db.redis,
    redis: db.redis,
    logger,
    mailer: { send: async (message) => void sentMail.push(message) },
  });
  app = buildTestApp({
    prisma: db.prisma,
    redis: db.redis,
    routes: collectRoutes({ auth }),
    guards: auth.guards,
    apiRateLimit: auth.apiRateLimit,
  });
});

afterAll(async () => {
  await db?.stop();
});

/**
 * @param {string} username
 * @param {string} password
 */
async function signIn(username, password) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/login').send({ identifier: username, password });
  return { agent, response, csrfToken: response.body.data?.csrfToken };
}

describe('auth against MySQL 9.7.1 with the legacy schema', () => {
  it('is ready when MySQL and Redis answer', async () => {
    const response = await request(app).get('/health/ready');
    expect(response.body).toEqual({ status: 'ok', checks: { database: 'ok', redis: 'ok' } });
  });

  it('signs in with a BCrypt legacy password and upgrades it without touching the legacy column', async () => {
    const [before] =
      await db.select`SELECT CURRENT_PASSWORD AS value FROM employee_credentials WHERE USER_NM = 'test.admin'`;
    const { response } = await signIn('test.admin', 'Test-Admin-Pass-1');
    expect(response.status).toBe(200);

    const [after] =
      await db.select`SELECT CURRENT_PASSWORD AS value FROM employee_credentials WHERE USER_NM = 'test.admin'`;
    expect(after).toEqual(before);
    const upgraded =
      await db.select`SELECT PASSWORD_HASH AS hash FROM ih_employee_password WHERE EMPLOYEE_CREDENTIALS_ID = 1`;
    expect(upgraded[0].hash).toMatch(/^\$argon2id\$/);

    expect((await signIn('test.admin', 'Test-Admin-Pass-1')).response.status).toBe(200);
  });

  it('computes effective permissions from active individual grants and role permissions', async () => {
    const cashier = await signIn('test.cashier', 'Test-Cashier-Pass-1');
    expect(cashier.response.body.data.user.permissionIds).toEqual([6, 8]);

    await db.prisma
      .$executeRaw`INSERT INTO ih_role_permission (ROLE_ID, PHARMA_ACCESS_ID, CREATED_BY) VALUES (1, 1, 'test')`;
    const admin = await signIn('test.admin', 'Test-Admin-Pass-1');
    expect(admin.response.body.data.user.permissionIds).toEqual([1]);
    expect(admin.response.body.data.user.roles).toEqual([
      { roleId: 1, name: 'ADMIN', pharmacyBranchId: 1 },
    ]);
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const { agent, response } = await signIn('test.cashier', 'Test-Cashier-Pass-1');
    const original = String(
      /** @type {string[]} */ (/** @type {unknown} */ (response.headers['set-cookie']))
        .find((cookie) => cookie.startsWith('ihealth_refresh='))
        ?.split(';')[0],
    );
    expect((await agent.post('/api/v1/auth/refresh')).status).toBe(200);
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', original)).status).toBe(
      401,
    );
    expect((await agent.post('/api/v1/auth/refresh')).status).toBe(401);
    const reasons =
      await db.select`SELECT DISTINCT REVOKED_REASON AS reason FROM ih_refresh_token WHERE REVOKED_REASON IS NOT NULL ORDER BY reason`;
    expect(reasons.map((/** @type {{ reason: string }} */ row) => row.reason)).toEqual(
      expect.arrayContaining(['REUSE_DETECTED', 'ROTATED']),
    );
  });

  it('locks a username in Redis after five failures', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await signIn('test.inactive', 'wrong');
    const locked = await signIn('test.inactive', 'Test-Inactive-Pass-1');
    expect(locked.response.status).toBe(423);
    expect(await db.redis.ttl('auth:login:account-3')).toBeGreaterThan(0);
  });

  it('verifies an approval PIN and writes the audit trail', async () => {
    const { agent, csrfToken } = await signIn('test.cashier', 'Test-Cashier-Pass-1');
    const response = await agent
      .post('/api/v1/auth/approval-pin/verify')
      .set('x-csrf-token', csrfToken)
      .send({ username: 'test.admin', pin: '1234' });
    expect(response.status).toBe(200);
    const actions =
      await db.select`SELECT DISTINCT ACTION AS action FROM ih_audit_log ORDER BY action`;
    expect(actions.map((/** @type {{ action: string }} */ row) => row.action)).toEqual(
      expect.arrayContaining([
        'auth.approval_pin',
        'auth.login',
        'auth.password_upgraded',
        'auth.refresh_reuse',
      ]),
    );
  });

  it('signs in by work email and resets a password through the emailed link', async () => {
    expect((await signIn('cashier@example.test', 'Test-Cashier-Pass-1')).response.status).toBe(200);

    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ identifier: 'Cashier@Example.test' });
    expect(forgot.status).toBe(200);
    const token = decodeURIComponent(/token=([^\s]+)/.exec(sentMail.at(-1)?.text ?? '')?.[1] ?? '');
    expect(token).not.toBe('');

    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'a-brand-new-password' });
    expect(reset.status).toBe(204);
    expect((await signIn('test.cashier', 'Test-Cashier-Pass-1')).response.status).toBe(401);
    expect((await signIn('test.cashier', 'a-brand-new-password')).response.status).toBe(200);

    const [legacy] =
      await db.select`SELECT CURRENT_PASSWORD AS value FROM employee_credentials WHERE USER_NM = 'test.cashier'`;
    expect(legacy.value).toBe('Test-Cashier-Pass-1');
    const resets = await db.select`SELECT USED_AT AS usedAt FROM ih_password_reset`;
    expect(resets.every((row) => row.usedAt !== null)).toBe(true);
  });
});
