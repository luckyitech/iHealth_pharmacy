import { PERMISSIONS } from '@ihealth/shared/permissions';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/env.js';
import { createAuditLog } from '../../src/features/audit/audit-log.js';
import { createAuthModule } from '../../src/features/auth/auth.module.js';
import { createEmployeeAccessRoutes } from '../../src/features/masters/employee-access.js';
import { collectRoutes } from '../../src/routes.js';
import { buildTestApp, TEST_ENV } from '../helpers.js';
import { startTestDatabase } from './database.js';

const ADMIN = { identifier: 'test.admin', password: 'Test-Admin-Pass-1', employeeId: 1 };
const CASHIER = { identifier: 'test.cashier', password: 'Test-Cashier-Pass-1', employeeId: 2 };
const TEMPORARY_PASSWORD = 'Temporary-Pass-2026';
const CHOSEN_PASSWORD = 'Chosen-By-Cashier-1';

/** @type {Awaited<ReturnType<typeof startTestDatabase>>} */
let db;
/** @type {import('express').Express} */
let app;
/** @type {Awaited<ReturnType<typeof signIn>>} */
let admin;

beforeAll(async () => {
  db = await startTestDatabase();
  const config = loadConfig({ ...TEST_ENV, DATABASE_URL: db.url });
  const logger = pino({ level: 'silent' });
  const audit = createAuditLog(db.prisma, logger);
  const auth = createAuthModule({
    config,
    prisma: db.prisma,
    counters: db.redis,
    redis: db.redis,
    logger,
    audit,
    mailer: { send: async () => {} },
  });
  app = buildTestApp({
    prisma: db.prisma,
    redis: db.redis,
    routes: collectRoutes({
      auth,
      access: {
        routes: createEmployeeAccessRoutes({
          prisma: db.prisma,
          accountAdmin: auth.accountAdmin,
          config,
        }),
      },
    }),
    guards: auth.guards,
  });
  await db.prisma
    .$executeRaw`INSERT INTO ih_role_permission (ROLE_ID, PHARMA_ACCESS_ID) VALUES (1, ${PERMISSIONS.MASTER_MASTERS_ENTRY.id})`;
  admin = await signIn(ADMIN.identifier, ADMIN.password);
});

afterAll(async () => {
  await db?.stop();
});

/**
 * @param {string} identifier
 * @param {string} password
 */
async function signIn(identifier, password) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/login').send({ identifier, password });
  return { agent, response, csrf: /** @type {string} */ (response.body.data?.csrfToken) };
}

/**
 * @param {'put' | 'post'} method
 * @param {number} employeeId
 * @param {string} path
 * @param {Record<string, unknown>} [body]
 */
const write = (method, employeeId, path, body = {}) =>
  admin.agent[method](`/api/v1/masters/employees/${employeeId}/access${path}`)
    .set('x-csrf-token', admin.csrf)
    .send(body);

describe('employee access', () => {
  it("shows an employee's sign-in without any password", async () => {
    const response = await admin.agent.get(
      `/api/v1/masters/employees/${CASHIER.employeeId}/access`,
    );
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      hasLogin: true,
      username: CASHIER.identifier,
      loginEnabled: true,
      lockedUntil: null,
      mustChangePassword: false,
    });
    expect(JSON.stringify(response.body)).not.toMatch(/password"?:\s*"/i);
  });

  it('sets a temporary password that must be changed before anything else works', async () => {
    const set = await write('put', CASHIER.employeeId, '/password', {
      password: TEMPORARY_PASSWORD,
      mustChangePassword: true,
    });
    expect(set.status).toBe(200);
    expect(set.body.data.mustChangePassword).toBe(true);
    expect((await signIn(CASHIER.identifier, CASHIER.password)).response.status).toBe(401);

    const cashier = await signIn(CASHIER.identifier, TEMPORARY_PASSWORD);
    expect(cashier.response.status).toBe(200);
    expect(cashier.response.body.data.user.mustChangePassword).toBe(true);
    const blocked = await cashier.agent.get('/api/v1/lookups/roles');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const changed = await cashier.agent
      .post('/api/v1/auth/change-password')
      .set('x-csrf-token', cashier.csrf)
      .send({ currentPassword: TEMPORARY_PASSWORD, newPassword: CHOSEN_PASSWORD });
    expect(changed.status).toBe(200);
    const csrf = changed.body.data.csrfToken;
    const me = await cashier.agent.get('/api/v1/auth/me').set('x-csrf-token', csrf);
    expect(me.body.data.mustChangePassword).toBe(false);
    // Now refused for lack of permission, no longer for the password.
    expect((await cashier.agent.get('/api/v1/lookups/roles')).body.error.code).toBe('FORBIDDEN');
  });

  it('turns sign-in off and on, and lifts a lockout', async () => {
    expect((await write('put', CASHIER.employeeId, '/status', { enabled: false })).status).toBe(
      200,
    );
    const refused = await signIn(CASHIER.identifier, CHOSEN_PASSWORD);
    expect(refused.response.body.error.code).toBe('ACCOUNT_INACTIVE');
    await write('put', CASHIER.employeeId, '/status', { enabled: true });

    for (let attempt = 0; attempt < 5; attempt += 1)
      await signIn(CASHIER.identifier, 'wrong-password');
    const locked = await admin.agent.get(`/api/v1/masters/employees/${CASHIER.employeeId}/access`);
    expect(locked.body.data.lockedUntil).not.toBeNull();
    const unlocked = await write('post', CASHIER.employeeId, '/unlock');
    expect(unlocked.body.data.lockedUntil).toBeNull();
    expect((await signIn(CASHIER.identifier, CHOSEN_PASSWORD)).response.status).toBe(200);
  });

  it('creates a sign-in for an employee who has none, with a unique username', async () => {
    await db.prisma
      .$executeRaw`INSERT INTO employee (EMPLOYEE_ID, FIRST_NM, LAST_NM, ACTIVE_S, CREATION_USER_ID, LAST_UPDATE_TS) VALUES (50, 'New', 'Starter', 'Y', 'test', NOW())`;
    const noPassword = await write('put', 50, '/login', { username: 'new.starter' });
    expect(noPassword.status).toBe(400);
    const taken = await write('put', 50, '/login', {
      username: CASHIER.identifier,
      password: TEMPORARY_PASSWORD,
    });
    expect(taken.status).toBe(409);

    const created = await write('put', 50, '/login', {
      username: 'new.starter',
      password: TEMPORARY_PASSWORD,
      mustChangePassword: true,
    });
    expect(created.body.data).toMatchObject({
      hasLogin: true,
      username: 'new.starter',
      mustChangePassword: true,
    });
    const starter = await signIn('new.starter', TEMPORARY_PASSWORD);
    expect(starter.response.status).toBe(200);
  });

  it('sets the role and the individual permissions', async () => {
    const role = await write('put', CASHIER.employeeId, '/role', { roleId: 1 });
    expect(role.body.data).toMatchObject({ roleId: 1 });
    expect(role.body.data.rolePermissionIds).toContain(PERMISSIONS.MASTER_MASTERS_ENTRY.id);

    const permissions = await write('put', CASHIER.employeeId, '/permissions', {
      permissionIds: [PERMISSIONS.MASTER_MASTERS_VIEW.id],
    });
    expect(permissions.body.data.permissionIds).toEqual([PERMISSIONS.MASTER_MASTERS_VIEW.id]);
    const [row] =
      await db.select`SELECT COUNT(*) AS n FROM employee_access WHERE EMPLOYEE_ID = ${CASHIER.employeeId} AND ACTIVE_S = 'Y'`;
    expect(Number(row.n)).toBe(1);
    expect(
      (await write('put', CASHIER.employeeId, '/permissions', { permissionIds: [999] })).status,
    ).toBe(400);
  });

  it('resets two-factor sign-in as the legacy system does, with a reason', async () => {
    await db.prisma
      .$executeRaw`UPDATE employee_credentials SET TWO_FACTOR_ENABLED_S = 'Y', TWO_FACTOR_EMAIL = 'mfa@example.test' WHERE EMPLOYEE_ID = ${CASHIER.employeeId}`;
    const reset = await write('post', CASHIER.employeeId, '/reset-two-factor', {
      reason: 'Lost access to the work email',
    });
    expect(reset.body.data.twoFactorEnabled).toBe(false);
    const [logged] =
      await db.select`SELECT RESET_BY_EMPLOYEE_ID AS byId, PREVIOUS_EMAIL AS previous FROM two_factor_reset_audit`;
    expect(logged).toEqual({ byId: ADMIN.employeeId, previous: 'mfa@example.test' });
  });

  it("refuses to change one's own sign-in, role or permissions", async () => {
    for (const [path, body] of /** @type {[string, Record<string, unknown>][]} */ ([
      ['/status', { enabled: false }],
      ['/role', { roleId: 1 }],
      ['/permissions', { permissionIds: [] }],
    ])) {
      const response = await write('put', ADMIN.employeeId, path, body);
      expect(response.status).toBe(403);
    }
  });
});
