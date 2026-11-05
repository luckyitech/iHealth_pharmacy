import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  ERROR_MESSAGES,
  errorResponseSchema,
  toErrorDetails,
} from './index.js';

describe('error taxonomy', () => {
  it('gives every code a status and a message', () => {
    for (const code of Object.values(ERROR_CODES)) {
      expect(ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
      expect(ERROR_MESSAGES[code]).toBeTruthy();
    }
  });

  it('validates the error envelope', () => {
    expect(
      errorResponseSchema.safeParse({ error: { code: 'NOT_FOUND', message: 'x', requestId: 'r1' } })
        .success,
    ).toBe(true);
    expect(errorResponseSchema.safeParse({ error: { code: 'NOPE', message: 'x' } }).success).toBe(
      false,
    );
  });

  it('turns Zod issues into field details', () => {
    const result = z
      .object({ items: z.array(z.object({ qty: z.number() })) })
      .safeParse({ items: [{ qty: 'x' }] });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(toErrorDetails(result.error)).toEqual([
        { path: 'items.0.qty', message: expect.any(String) },
      ]);
  });
});
