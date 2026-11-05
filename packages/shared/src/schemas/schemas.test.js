import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  buildListMeta,
  createListQuerySchema,
  emailSchema,
  fromLegacyFlag,
  idParamsSchema,
  itemSupplierInputSchema,
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

  it('normalises emails', () => {
    expect(emailSchema.parse(' Jane@Example.TEST ')).toBe('jane@example.test');
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

describe('itemSupplierInputSchema', () => {
  const valid = {
    itemId: '4',
    supplierId: 7,
    priority: '1',
    unitRate: '1250.5',
    discountPercent: '2.25',
    validUntil: '2026-12-31',
  };

  it('accepts a link and coerces form values', () => {
    expect(itemSupplierInputSchema.parse(valid)).toEqual({
      itemId: 4,
      supplierId: 7,
      priority: 1,
      unitRate: 1250.5,
      discountPercent: 2.25,
      validUntil: '2026-12-31',
    });
  });

  it('rejects other priorities, discounts above 100% and more than two decimals', () => {
    const issues = (/** @type {Record<string, unknown>} */ change) =>
      itemSupplierInputSchema
        .safeParse({ ...valid, ...change })
        .error?.issues.map((issue) => issue.message);
    expect(issues({ priority: '4' })).toEqual(['Choose a priority']);
    expect(issues({ priority: '' })).toEqual(['Choose a priority']);
    expect(issues({ discountPercent: '100.5' })).toEqual(['Use at most 100']);
    expect(issues({ unitRate: '1.005' })).toEqual(['Use at most two decimal places']);
    expect(issues({ unitRate: '-1' })).toEqual(['Cannot be negative']);
    expect(issues({ unitRate: '' })).toEqual(['Enter the rate per pack']);
    expect(issues({ validUntil: '' })).toEqual(['Enter the validity date']);
  });
});
