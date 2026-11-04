import { z } from 'zod';

const MAX_USERNAME_LENGTH = 50;
// Longest legacy value is EMAIL_ID varchar(50); 100 leaves room without inviting abuse.
const MAX_IDENTIFIER_LENGTH = 100;
const MAX_PASSWORD_LENGTH = 200;
const MAX_PIN_LENGTH = 100;
const MAX_TOKEN_LENGTH = 200;

/** New passwords (password reset). Legacy passwords of any length still sign in. */
export const MIN_NEW_PASSWORD_LENGTH = 10;

/**
 * A username or a work email: the sign-in and forgot-password forms accept either.
 * Trimmed; the API matches both without regard to case.
 */
export const loginIdentifierSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email or username')
  .max(MAX_IDENTIFIER_LENGTH);

/**
 * @param {string} identifier
 * @returns {boolean} Whether it looks like an email rather than a username.
 */
export const isEmailIdentifier = (identifier) => identifier.includes('@');

/** Sign-in form and `POST /auth/login` body. Used by both the web form and the API. */
export const loginBodySchema = z.object({
  identifier: loginIdentifierSchema,
  // Passwords are not trimmed: spaces may be part of a legacy password.
  password: z.string().min(1, 'Enter your password').max(MAX_PASSWORD_LENGTH),
});

/** `POST /auth/forgot-password` body. */
export const forgotPasswordBodySchema = z.object({
  identifier: loginIdentifierSchema,
});

/** A new password chosen by the user. The API also rejects one equal to the username or email. */
export const newPasswordSchema = z
  .string()
  .min(MIN_NEW_PASSWORD_LENGTH, `Use at least ${MIN_NEW_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH);

/** Reset-password form. The API body is the same without `confirmPassword`. */
export const resetPasswordFormSchema = z
  .object({
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The passwords do not match',
  });

/** `POST /auth/reset-password` body. */
export const resetPasswordBodySchema = z.object({
  token: z.string().min(1).max(MAX_TOKEN_LENGTH),
  password: newPasswordSchema,
});

/** @typedef {z.infer<typeof loginBodySchema>} LoginBody */

/** Supervisor approval: `POST /auth/approval-pin/verify` body. */
export const approvalPinBodySchema = z.object({
  username: z.string().trim().min(1, "Enter the approver's username").max(MAX_USERNAME_LENGTH),
  pin: z.string().min(1, 'Enter the approval PIN').max(MAX_PIN_LENGTH),
  action: z.string().trim().max(64).optional(),
});
