import { describe, expect, it } from 'vitest';

import { parseAmount, previewPayment, quickAmounts } from './payment.js';

const CASH = { cash: true, mpesa: false, cashText: '', mpesaText: '', code: '' };

describe('the payment window', () => {
  it('reads amounts as typed, with commas and spaces', () => {
    expect(parseAmount('1,000')).toBe('1000.00');
    expect(parseAmount(' 250.5 ')).toBe('250.50');
    expect(parseAmount('')).toBe('0.00');
    expect(parseAmount('12a')).toBeNull();
    expect(parseAmount('1.234')).toBeNull();
  });

  it('offers the exact amount and the next round notes', () => {
    expect(quickAmounts('267.00', [50, 100, 200, 500, 1000])).toEqual([
      '267.00',
      '300.00',
      '400.00',
      '500.00',
    ]);
    expect(quickAmounts('500.00', [50, 100, 200, 500, 1000])).toEqual([
      '500.00',
      '600.00',
      '1000.00',
    ]);
  });

  it('gives change on cash, and says how much is short', () => {
    expect(previewPayment('267.00', { ...CASH, cashText: '300' })).toMatchObject({
      change: '33.00',
      problems: {},
      payments: [{ method: 'cash', amount: '300.00' }],
    });
    expect(previewPayment('267.00', { ...CASH, cashText: '200' }).problems).toEqual({
      cash: '67.00 short',
    });
  });

  it('takes M-Pesa alone for the whole bill, with the full code in capitals', () => {
    const preview = previewPayment('267.00', {
      ...CASH,
      cash: false,
      mpesa: true,
      code: 'qk52ab1xyz',
    });
    expect(preview.problems).toEqual({});
    expect(preview.payments).toEqual([
      { method: 'mpesa', amount: '267.00', reference: 'QK52AB1XYZ' },
    ]);
    expect(
      previewPayment('267.00', { ...CASH, cash: false, mpesa: true, code: 'AB12' }).problems,
    ).toEqual({
      code: 'Enter all 10 characters of the M-Pesa code',
    });
  });

  it('splits M-Pesa and cash, and refuses M-Pesa above the bill', () => {
    const both = {
      cash: true,
      mpesa: true,
      cashText: '300',
      mpesaText: '1000',
      code: 'QK52AB1XYZ',
    };
    expect(previewPayment('1267.00', both)).toMatchObject({
      cashDue: '267.00',
      change: '33.00',
      problems: {},
    });
    expect(previewPayment('900.00', both).problems.mpesa).toBe(
      'M-Pesa cannot be more than the bill',
    );
  });
});
