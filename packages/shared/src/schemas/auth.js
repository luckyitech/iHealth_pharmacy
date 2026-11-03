import { z } from 'zod';

const MAX_USERNAME_LENGTH = 50;
const MAX_PASSWORD_LENGTH = 200;
const MAX_PIN_LENGTH = 100;

/** Sign-in form and `POST /auth/login` body. Used by both the web form and the API. */
export const loginBodySchema = z.object({
  username: z.string().trim().min(1, 'Enter your username').max(MAX_USERNAME_LENGTH),
  // Passwords are not trimmed: spaces may be part of a legacy password.
  password: z.string().min(1, 'Enter your password').max(MAX_PASSWORD_LENGTH),
});

/** @typedef {z.infer<typeof loginBodySchema>} LoginBody */

/** Supervisor approval: `POST /auth/approval-pin/verify` body. */
export const approvalPinBodySchema = z.object({
  username: z.string().trim().min(1, "Enter the approver's username").max(MAX_USERNAME_LENGTH),
  pin: z.string().min(1, 'Enter the approval PIN').max(MAX_PIN_LENGTH),
  action: z.string().trim().max(64).optional(),
});
