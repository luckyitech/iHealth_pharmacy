import pino from 'pino';

import { getRequestContext } from './request-context.js';

/**
 * Paths removed from every log line. Health data and credentials must never reach the logs.
 */
export const REDACTED_PATHS = Object.freeze([
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.pin',
  '*.approvalPin',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
]);

/**
 * @param {{ level: string, pretty?: boolean }} options
 * @returns {import('pino').Logger}
 */
export function createLogger({ level, pretty = false }) {
  return pino({
    level,
    redact: { paths: [...REDACTED_PATHS], censor: '[redacted]' },
    // Every line logged while handling a request carries its id and, once known, the employee.
    mixin() {
      const context = getRequestContext();
      return context ? { requestId: context.requestId, employeeId: context.employeeId } : {};
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
  });
}
