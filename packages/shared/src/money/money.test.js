import { describe, expect, it } from 'vitest';

import {
  addMoney,
  compareMoney,
  formatMoney,
  moneySchema,
  moneyToString,
  multiplyMoney,
  nonNegativeMoneySchema,
  percentOf,
  roundMoney,
  subtractMoney,
  toMoney,
} from './index.js';

describe('money arithmetic', () => {
  it('avoids floating point errors', () => {
    expect(moneyToString(addMoney('0.1', '0.2'))).toBe('0.30');
    expect(moneyToString(addMoney(0.1, 0.2))).toBe('0.30');
    expect(moneyToString(multiplyMoney('19.99', 3))).toBe('59.97');
  });

  it('rounds half up to cents', () => {
    expect(roundMoney('2.345').toFixed(2)).toBe('2.35');
    expect(roundMoney('2.344').toFixed(2)).toBe('2.34');
    expect(roundMoney('-2.345').toFixed(2)).toBe('-2.35');
  });

  it('computes percentages and differences', () => {
    expect(moneyToString(percentOf('1000', 16))).toBe('160.00');
    expect(moneyToString(subtractMoney('100', '0.01'))).toBe('99.99');
    expect(compareMoney('10.00', '9.99')).toBe(1);
    expect(compareMoney('10', '10.00')).toBe(0);
  });

  it('rejects invalid values', () => {
    expect(() => toMoney(Number.NaN)).toThrow(RangeError);
    expect(() => toMoney(Infinity)).toThrow(RangeError);
    expect(() => toMoney('12,50')).toThrow(RangeError);
    expect(() => toMoney('abc')).toThrow(RangeError);
  });

  it('keeps precision for large amounts', () => {
    expect(moneyToString(addMoney('99999999999999.99', '0.01'))).toBe('100000000000000.00');
  });

  it('formats in the configured locale and currency', () => {
    const kenya = { locale: 'en-KE', currency: 'KES' };
    expect(formatMoney('1250.5', kenya)).toMatch(/1,250\.50/);
    expect(formatMoney('1250.5', kenya)).toMatch(/Ksh|KES/);
    expect(formatMoney('1250.5', { locale: 'en-US', currency: 'USD' })).toBe('$1,250.50');
  });
});

describe('moneySchema', () => {
  it('normalises to the two-decimal wire format', () => {
    expect(moneySchema.parse('12.5')).toBe('12.50');
    expect(moneySchema.parse(12)).toBe('12.00');
  });

  it('rejects more than two decimals and malformed input', () => {
    expect(moneySchema.safeParse('12.345').success).toBe(false);
    expect(moneySchema.safeParse('1e3').success).toBe(false);
    expect(moneySchema.safeParse('').success).toBe(false);
  });

  it('can require non-negative amounts', () => {
    expect(nonNegativeMoneySchema.safeParse('-1').success).toBe(false);
    expect(nonNegativeMoneySchema.parse('0')).toBe('0.00');
  });
});
