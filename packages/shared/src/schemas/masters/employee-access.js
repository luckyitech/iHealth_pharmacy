import { z } from 'zod';

import { PERMISSION_LIST } from '../../permissions/index.js';
import { newPasswordSchema } from '../auth.js';
import { idSchema, requiredIdSchema, requiredText } from '../common.js';

/** Legacy USER_NM is VARCHAR(50). */
const USERNAME_MAX = 50;
const USERNAME_MIN = 3;
/** Longest reason kept with a two-factor reset (legacy REASON column). */
export const TWO_FACTOR_RESET_REASON_MAX = 200;

const KNOWN_PERMISSIONS = new Set(
  /** @type {number[]} */ (PERMISSION_LIST.map((permission) => permission.id)),
);

/** A sign-in name: letters, digits, dots, dashes, underscores and the at sign, as stored usernames are. */
export const usernameSchema = requiredText(USERNAME_MAX)
  .min(USERNAME_MIN, `Use at least ${USERNAME_MIN} characters`)
  .regex(/^[A-Za-z0-9._@-]+$/, 'Use only letters, digits, dots, dashes, underscores or @');

/** `PUT /masters/employees/:id/access/login`: create the sign-in (with a first password) or rename it. */
export const employeeLoginBodySchema = z.object({
  username: usernameSchema,
  // Required when the employee has no sign-in yet; the API says so if it is missing.
  password: newPasswordSchema.optional(),
  mustChangePassword: z.boolean().default(true),
});

/** Form that creates a sign-in: a username and a first password (with confirmation). */
export const newLoginFormSchema = z
  .object({
    username: usernameSchema,
    password: newPasswordSchema,
    confirmPassword: z.string(),
    mustChangePassword: z.boolean(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The passwords do not match',
  });

/** `PUT /masters/employees/:id/access/password`: an administrator sets a new password. */
export const employeePasswordBodySchema = z.object({
  password: newPasswordSchema,
  mustChangePassword: z.boolean().default(true),
});

/** Set-password form (with confirmation). */
export const employeePasswordFormSchema = z
  .object({
    password: newPasswordSchema,
    confirmPassword: z.string(),
    mustChangePassword: z.boolean(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The passwords do not match',
  });

/** `PUT /masters/employees/:id/access/status`. */
export const loginStatusBodySchema = z.object({ enabled: z.boolean() });

/** `POST /masters/employees/:id/access/reset-two-factor`. */
export const twoFactorResetBodySchema = z.object({
  reason: requiredText(TWO_FACTOR_RESET_REASON_MAX),
});

/** `PUT /masters/employees/:id/access/role`. */
export const employeeRoleBodySchema = z.object({ roleId: requiredIdSchema('Choose a role') });

/** `PUT /masters/employees/:id/access/permissions`: the individual grants, exactly. */
export const employeePermissionsBodySchema = z.object({
  permissionIds: z
    .array(idSchema)
    .max(KNOWN_PERMISSIONS.size)
    .refine((ids) => ids.every((id) => KNOWN_PERMISSIONS.has(id)), 'Unknown permission')
    .transform((ids) => [...new Set(ids)]),
});

/** An employee's sign-in and access, as administrators see it. Never includes a password. */
export const employeeAccessSchema = z.object({
  employeeId: z.number().int(),
  hasLogin: z.boolean(),
  username: z.string().nullable(),
  loginEnabled: z.boolean(),
  lockedUntil: z.string().nullable(),
  twoFactorEnabled: z.boolean(),
  mustChangePassword: z.boolean(),
  roleId: z.number().int().nullable(),
  roleName: z.string().nullable(),
  // Individual grants (editable here) and those that come with the role (shown, not edited here).
  permissionIds: z.array(z.number().int()),
  rolePermissionIds: z.array(z.number().int()),
});

export const roleOptionSchema = z.object({ id: z.number().int(), name: z.string() });
