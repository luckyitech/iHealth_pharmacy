/* eslint-disable jsdoc/reject-any-type -- each route's body is typed by its Zod schema */
import { POLICIES } from '@ihealth/shared/permissions';
import {
  activityEntrySchema,
  dataResponseSchema,
  employeeAccessSchema,
  employeeApprovalPinBodySchema,
  employeeLoginBodySchema,
  employeePasswordBodySchema,
  employeePermissionsBodySchema,
  employeeRoleBodySchema,
  idParamsSchema,
  loginStatusBodySchema,
  roleOptionSchema,
  twoFactorResetBodySchema,
} from '@ihealth/shared/schemas';
import { z } from 'zod';

import { defineRoute } from '../../http/define-route.js';
import { getAuth } from '../auth/auth.guards.js';
import { currentPharmacyId } from './current-pharmacy.js';

const PATH = '/masters/employees/:id/access';
const TAGS = ['Masters'];
const accessResponse = dataResponseSchema(employeeAccessSchema);

/**
 * An employee's sign-in and access: username and password, sign-in on or off, lockout, two-factor
 * reset, approval PIN, role and individual permissions. Every write answers with the updated access.
 *
 * @param {{ prisma: import('#db').PrismaClient, accountAdmin: import('../auth/account-admin.service.js').AccountAdminService, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The routes.
 */
export function createEmployeeAccessRoutes({ prisma, accountAdmin, config }) {
  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {import('../auth/account-admin.service.js').Actor}
   */
  const actor = (req, res) => ({ employeeId: getAuth(res).employeeId, ipAddress: req.ip });

  /**
   * A write that answers with the employee's access afterwards.
   *
   * @param {object} route
   * @param {'put' | 'post'} route.method
   * @param {string} route.path Under the access path, e.g. `/password`.
   * @param {string} route.summary
   * @param {import('zod').ZodType} [route.body]
   * @param {readonly import('@ihealth/shared/permissions').PermissionDefinition[]} [route.permissions]
   * @param {(context: { id: number, body: any, actor: import('../auth/account-admin.service.js').Actor }) => Promise<unknown>} route.run
   * @returns The route definition.
   */
  const write = ({
    method,
    path,
    summary,
    body,
    permissions = POLICIES.employeeAccess.write,
    run,
  }) =>
    defineRoute({
      method,
      path: `${PATH}${path}`,
      summary,
      tags: TAGS,
      permissions,
      request: { params: idParamsSchema, ...(body ? { body } : {}) },
      responses: { 200: { description: 'The access afterwards', schema: accessResponse } },
      handler: async ({ req, res, input }) => {
        const id = input.params.id;
        await run({ id, body: input.body, actor: actor(req, res) });
        return { data: await accountAdmin.getAccess(id) };
      },
    });

  return [
    defineRoute({
      method: 'get',
      path: PATH,
      summary: "An employee's sign-in and access",
      tags: TAGS,
      permissions: POLICIES.employeeAccess.read,
      request: { params: idParamsSchema },
      responses: { 200: { description: 'Access', schema: accessResponse } },
      handler: async ({ input }) => ({ data: await accountAdmin.getAccess(input.params.id) }),
    }),
    defineRoute({
      method: 'get',
      path: `${PATH}/history`,
      summary: "Every change to an employee's sign-in and access: what, who, when",
      description: 'Oldest first. Never shows a password or PIN.',
      tags: TAGS,
      permissions: POLICIES.employeeAccess.read,
      request: { params: idParamsSchema },
      responses: {
        200: { description: 'History', schema: dataResponseSchema(z.array(activityEntrySchema)) },
      },
      handler: async ({ input }) => ({
        data: await accountAdmin.history(input.params.id, config.historyLimit),
      }),
    }),
    write({
      method: 'put',
      path: '/login',
      summary: 'Create the sign-in (with a first password) or change the username',
      body: employeeLoginBodySchema,
      run: ({ id, body, actor: by }) => accountAdmin.saveLogin({ employeeId: id, ...body }, by),
    }),
    write({
      method: 'put',
      path: '/password',
      summary: 'Set a new password (signs the employee out everywhere)',
      body: employeePasswordBodySchema,
      permissions: POLICIES.employeePasswords.write,
      run: ({ id, body, actor: by }) => accountAdmin.setPassword({ employeeId: id, ...body }, by),
    }),
    write({
      method: 'put',
      path: '/approval-pin',
      summary: 'Set or reset the approval PIN (also lifts a lock after wrong PINs)',
      body: employeeApprovalPinBodySchema,
      // A PIN is a secret like the password: the same people may set it.
      permissions: POLICIES.employeePasswords.write,
      run: ({ id, body, actor: by }) =>
        accountAdmin.setApprovalPin({ employeeId: id, ...body }, by),
    }),
    write({
      method: 'put',
      path: '/status',
      summary: 'Turn sign-in on or off',
      body: loginStatusBodySchema,
      run: ({ id, body, actor: by }) =>
        accountAdmin.setLoginEnabled({ employeeId: id, enabled: body.enabled }, by),
    }),
    write({
      method: 'post',
      path: '/unlock',
      summary: 'Lift a lockout after too many wrong passwords',
      run: ({ id, actor: by }) => accountAdmin.unlock(id, by),
    }),
    write({
      method: 'post',
      path: '/reset-two-factor',
      summary: 'Turn two-factor sign-in off (revokes trusted devices), with a reason',
      body: twoFactorResetBodySchema,
      run: ({ id, body, actor: by }) =>
        accountAdmin.resetTwoFactor({ employeeId: id, reason: body.reason }, by),
    }),
    write({
      method: 'put',
      path: '/role',
      summary: "Set the employee's role",
      body: employeeRoleBodySchema,
      run: async ({ id, body, actor: by }) =>
        accountAdmin.setRole(
          // There is no branch table: role assignments belong to this installation's pharmacy.
          {
            employeeId: id,
            roleId: body.roleId,
            branchId: await currentPharmacyId(prisma, config),
          },
          by,
        ),
    }),
    write({
      method: 'put',
      path: '/permissions',
      summary: "Set the employee's individual permissions (exactly the list sent)",
      body: employeePermissionsBodySchema,
      run: ({ id, body, actor: by }) =>
        accountAdmin.setPermissions({ employeeId: id, permissionIds: body.permissionIds }, by),
    }),
    defineRoute({
      method: 'get',
      path: '/lookups/roles',
      summary: 'Staff roles',
      tags: ['Lookups'],
      permissions: POLICIES.employeeAccess.read,
      responses: {
        200: { description: 'Roles', schema: dataResponseSchema(z.array(roleOptionSchema)) },
      },
      handler: async () => ({ data: await accountAdmin.listRoles() }),
    }),
  ];
}
