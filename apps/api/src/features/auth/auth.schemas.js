import { dataResponseSchema } from '@ihealth/shared/schemas';
import { z } from 'zod';

export {
  approvalPinBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  resetPasswordBodySchema,
} from '@ihealth/shared/schemas';

/** Same body whatever happened, so the endpoint cannot be used to discover accounts. */
export const forgotPasswordResponseSchema = dataResponseSchema(z.object({ message: z.string() }));

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
  // An administrator asked for a new password: nothing else works until it is changed.
  mustChangePassword: z.boolean(),
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
