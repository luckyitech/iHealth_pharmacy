import { dataResponseSchema } from '@ihealth/shared/schemas';
import { z } from 'zod';

const MAX_USERNAME_LENGTH = 50;
const MAX_PASSWORD_LENGTH = 200;
const MAX_PIN_LENGTH = 100;

export const loginBodySchema = z.object({
  username: z.string().trim().min(1, 'Enter your username').max(MAX_USERNAME_LENGTH),
  // Passwords are not trimmed: spaces may be part of a legacy password.
  password: z.string().min(1, 'Enter your password').max(MAX_PASSWORD_LENGTH),
});

export const approvalPinBodySchema = z.object({
  username: z.string().trim().min(1, "Enter the approver's username").max(MAX_USERNAME_LENGTH),
  pin: z.string().min(1, 'Enter the approval PIN').max(MAX_PIN_LENGTH),
  action: z.string().trim().max(64).optional(),
});

export const currentUserSchema = z.object({
  employeeId: z.number().int(),
  username: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  pharmacyId: z.number().int().nullable(),
  roles: z.array(
    z.object({
      roleId: z.number().int(),
      name: z.string().nullable(),
      pharmacyBranchId: z.number().int(),
    }),
  ),
  permissionIds: z.array(z.number().int()),
});

/** @typedef {z.infer<typeof currentUserSchema>} CurrentUser */

const csrfSchema = z.object({ csrfToken: z.string() });

export const loginResponseSchema = dataResponseSchema(
  z.object({ user: currentUserSchema, csrfToken: z.string() }),
);
export const csrfResponseSchema = dataResponseSchema(csrfSchema);
export const currentUserResponseSchema = dataResponseSchema(currentUserSchema);
export const approvalPinResponseSchema = dataResponseSchema(
  z.object({ approverEmployeeId: z.number().int(), approverName: z.string() }),
);
