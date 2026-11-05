import { z } from 'zod';

import { ERROR_CODES } from './codes.js';

/** One invalid field. `path` uses dot notation (`items.0.quantity`). */
export const errorDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
});

/** Every non-2xx API response has this body. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.enum(
      /** @type {[keyof typeof ERROR_CODES, ...(keyof typeof ERROR_CODES)[]]} */ (
        Object.keys(ERROR_CODES)
      ),
    ),
    message: z.string(),
    details: z.array(errorDetailSchema).optional(),
    requestId: z.string().optional(),
  }),
});

/** @typedef {z.infer<typeof errorResponseSchema>} ErrorResponse */
/** @typedef {z.infer<typeof errorDetailSchema>} ErrorDetail */

/**
 * Converts a Zod error into API error details.
 *
 * @param {z.ZodError} error
 * @returns {ErrorDetail[]}
 */
export function toErrorDetails(error) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}
