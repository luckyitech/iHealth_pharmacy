import { dataResponseSchema } from '@ihealth/shared/schemas';
import { z } from 'zod';

export { approvalPinBodySchema, loginBodySchema } from '@ihealth/shared/schemas';

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
