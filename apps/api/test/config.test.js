import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config/env.js';
import { TEST_ENV } from './helpers.js';

describe('loadConfig', () => {
  it('parses a valid environment', () => {
    const config = loadConfig(TEST_ENV);
    expect(config).toMatchObject({
      env: 'test',
      port: 4000,
      corsOrigins: ['http://localhost:5173'],
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('lists every problem at once', () => {
    expect(() =>
      loadConfig({ ...TEST_ENV, DATABASE_URL: 'postgres://x', JWT_ACCESS_SECRET: 'short' }),
    ).toThrow(/DATABASE_URL[\s\S]*JWT_ACCESS_SECRET|JWT_ACCESS_SECRET[\s\S]*DATABASE_URL/);
  });

  it('rejects malformed CORS origins', () => {
    expect(() => loadConfig({ ...TEST_ENV, CORS_ORIGINS: 'not a url' })).toThrow(/CORS_ORIGINS/);
  });

  it('requires secure cookies in production', () => {
    expect(() => loadConfig({ ...TEST_ENV, NODE_ENV: 'production' })).toThrow(/COOKIE_SECURE/);
    expect(
      loadConfig({ ...TEST_ENV, NODE_ENV: 'production', COOKIE_SECURE: 'true' }).isProduction,
    ).toBe(true);
  });
});
