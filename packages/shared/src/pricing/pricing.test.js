import { describe, expect, it } from 'vitest';

import { priceBill, priceLine } from './index.js';

describe('priceLine', () => {
  it('takes VAT out of the label price, discounts before VAT and charges VAT on the rest', () => {
    expect(
      priceLine({ labelPrice: '116.00', quantity: 3, discountPercent: 10, vatPercent: 16 }),
    ).toEqual({
      unitPrice: '100.0000',
      gross: '300.00',
      discount: '30.00',
      vat: '43.20',
      amount: '313.20',
      profit: null,
      belowCost: false,
    });
  });

  it('charges exactly the label price when there is no discount, whatever the VAT', () => {
    expect(priceLine({ labelPrice: '45.50', quantity: 7, vatPercent: 16 }).amount).toBe('318.50');
    expect(priceLine({ labelPrice: '45.50', quantity: 7 }).amount).toBe('318.50');
  });

  it('works out profit before VAT from the cost after the supplier discount', () => {
    const line = priceLine({
      labelPrice: '116.00',
      quantity: 2,
      vatPercent: 16,
      unitCost: '80.00',
      costDiscountPercent: 5,
    });
    expect(line.profit).toBe('48.00');
    expect(line.belowCost).toBe(false);
    expect(priceLine({ labelPrice: '50.00', quantity: 1, unitCost: '60.00' }).belowCost).toBe(true);
  });

  it('is exact where floating point is not', () => {
    // 0.1 + 0.2 style errors made the legacy app round some totals the wrong way.
    expect(priceLine({ labelPrice: '0.10', quantity: 3 }).amount).toBe('0.30');
    expect(priceLine({ labelPrice: '1.005', quantity: 1 }).amount).toBe('1.01');
  });
});

describe('priceBill', () => {
  const lines = [
    { labelPrice: '116.00', quantity: 1, vatPercent: 16 },
    { labelPrice: '20.25', quantity: 2, discountPercent: 10 },
  ];

  it('rounds the net to the step and says how much was rounded off', () => {
    expect(priceBill(lines, { roundingStep: 1 })).toMatchObject({
      gross: '156.50',
      discount: '4.05',
      vat: '16.00',
      subtotal: '152.45',
      roundedOff: '-0.45',
      net: '152.00',
      quantity: 3,
    });
  });

  it('rounds half up, and keeps cents with a step of 0', () => {
    expect(priceBill([{ labelPrice: '10.50', quantity: 1 }], { roundingStep: 1 }).net).toBe(
      '11.00',
    );
    expect(priceBill(lines, { roundingStep: 0 })).toMatchObject({
      net: '152.45',
      roundedOff: '0.00',
    });
    expect(priceBill(lines, { roundingStep: '0.05' }).net).toBe('152.45');
  });

  it('adds up profit only when every line has a cost', () => {
    expect(priceBill(lines, { roundingStep: 1 }).profit).toBeNull();
    expect(
      priceBill([{ labelPrice: '116.00', quantity: 1, vatPercent: 16, unitCost: '90.00' }], {
        roundingStep: 1,
      }).profit,
    ).toBe('10.00');
  });
});
