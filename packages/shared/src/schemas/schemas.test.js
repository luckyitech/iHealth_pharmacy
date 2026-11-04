import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  buildListMeta,
  createListQuerySchema,
  emailSchema,
  fromLegacyFlag,
  idParamsSchema,
  kenyanPhoneSchema,
  MAX_PAGE_SIZE,
  optionalTextSchema,
  requiredTextSchema,
  toLegacyFlag,
} from './index.js';

describe('common schemas', () => {
  it('coerces ids from path parameters', () => {
    expect(idParamsSchema.parse({ id: '42' })).toEqual({ id: 42 });
    expect(idParamsSchema.safeParse({ id: '0' }).success).toBe(false);
    expect(idParamsSchema.safeParse({ id: '1.5' }).success).toBe(false);
  });

  it('trims text', () => {
    expect(requiredTextSchema.parse('  Panadol  ')).toBe('Panadol');
    expect(requiredTextSchema.safeParse('   ').success).toBe(false);
    expect(optionalTextSchema.parse('  ')).toBeNull();
  });

  it('normalises emails and Kenyan phone numbers', () => {
    expect(emailSchema.parse(' Jane@Example.TEST ')).toBe('jane@example.test');
    expect(kenyanPhoneSchema.parse('0712 345 678')).toBe('+254712345678');
    expect(kenyanPhoneSchema.parse('254112345678')).toBe('+254112345678');
    expect(kenyanPhoneSchema.safeParse('0812345678').success).toBe(false);
  });

  it('maps legacy Y/N flags', () => {
    expect(fromLegacyFlag('Y')).toBe(true);
    expect(fromLegacyFlag(null)).toBe(false);
    expect(toLegacyFlag(false)).toBe('N');
  });
});

describe('createListQuerySchema', () => {
  const schema = createListQuerySchema({
    sortable: ['name', 'createdAt'],
    defaultSort: '-createdAt',
    filters: { active: z.enum(['Y', 'N']).optional() },
  });

  it('applies defaults', () => {
    expect(schema.parse({})).toEqual({
      page: 1,
      pageSize: 25,
      sort: { field: 'createdAt', direction: 'desc' },
    });
  });

  it('parses query strings and filters', () => {
    expect(
      schema.parse({ page: '3', pageSize: '50', sort: 'name', q: ' pan ', active: 'Y' }),
    ).toEqual({
      page: 3,
      pageSize: 50,
      sort: { field: 'name', direction: 'asc' },
      q: 'pan',
      active: 'Y',
    });
  });

  it('rejects unknown sort fields and oversized pages', () => {
    expect(schema.safeParse({ sort: 'password' }).success).toBe(false);
    expect(schema.safeParse({ pageSize: String(MAX_PAGE_SIZE + 1) }).success).toBe(false);
  });

  it('builds pagination metadata', () => {
    expect(buildListMeta({ page: 2, pageSize: 25, total: 51 })).toEqual({
      page: 2,
      pageSize: 25,
      total: 51,
      totalPages: 3,
    });
  });
});
