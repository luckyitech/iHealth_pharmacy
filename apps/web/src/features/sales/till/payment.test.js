import { describe, expect, it } from 'vitest';

import { monthsBefore, newRow, parseAmount, previewPayment, quickAmounts } from './payment.js';

const RULES = { today: '2026-11-06', chequeMaxAgeMonths: 6 };

/**
 * @param {string} method
 * @param {string} amount
 * @param {Partial<import('./payment.js').PaymentRow>} [extra]
 * @returns {import('./payment.js').PaymentRow}
 */
const row = (method, amount, extra = {}) => ({ ...newRow(method, amount), ...extra });

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
    expect(previewPayment('267.00', [row('cash', '300')], RULES)).toMatchObject({
      change: '33.00',
      ready: true,
      payments: [{ method: 'cash', amount: '300.00' }],
    });
    const short = previewPayment('267.00', [row('cash', '200')], RULES);
    expect(short).toMatchObject({ remaining: '67.00', ready: false });
    expect(short.problems).toEqual({ 'cash.amount': '67.00 short' });
  });

  it('takes M-Pesa with its full code in capitals', () => {
    const preview = previewPayment(
      '267.00',
      [row('mpesa', '267', { reference: 'qk52ab1xyz' })],
      RULES,
    );
    expect(preview.ready).toBe(true);
    expect(preview.payments).toEqual([
      { method: 'mpesa', amount: '267.00', reference: 'QK52AB1XYZ' },
    ]);
  });

  it('needs the approval code for a card, and nothing else', () => {
    expect(previewPayment('500.00', [row('card', '500')], RULES).problems).toEqual({
      'card.reference': 'Enter the approval code from the card machine slip',
    });
    expect(
      previewPayment('500.00', [row('card', '500', { reference: '482193' })], RULES).ready,
    ).toBe(true);
  });

  it('needs the number, bank and a recent date for a cheque', () => {
    expect(previewPayment('500.00', [row('cheque', '500')], RULES).problems).toEqual({
      'cheque.reference': 'Enter the cheque number',
      'cheque.bankId': 'Choose the bank',
      'cheque.chequeDate': 'Enter the date on the cheque',
    });
    const stale = row('cheque', '500', {
      reference: '000731',
      bankId: '1',
      chequeDate: '2026-01-12',
    });
    expect(previewPayment('500.00', [stale], RULES).problems).toEqual({
      'cheque.chequeDate': 'Older than 6 months',
    });
    expect(monthsBefore('2026-11-06', 6)).toBe('2026-05-06');
  });

  it('splits any mix, gives change only from cash, and shows what is still to pay', () => {
    const card = row('card', '2000', { reference: '482193' });
    expect(previewPayment('2480.00', [card, row('cash', '500')], RULES)).toMatchObject({
      cashDue: '480.00',
      change: '20.00',
      ready: true,
    });
    const mpesa = row('mpesa', '3000', { reference: 'QK52AB1XYZ' });
    const cheque = row('cheque', '15000', {
      reference: '000731',
      bankId: '1',
      chequeDate: '2026-11-01',
    });
    expect(previewPayment('18650.00', [cheque, mpesa], RULES)).toMatchObject({
      remaining: '650.00',
      ready: false,
      problems: {},
    });
    expect(previewPayment('1000.00', [cheque, mpesa], RULES).problems).toEqual({
      'mpesa.amount': "M-Pesa, card and cheque together can't be more than the bill",
    });
  });
});
