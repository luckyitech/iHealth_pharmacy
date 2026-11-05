import { describe, expect, it } from 'vitest';

import { customerForApi, linesForApi, newSale, parseEntry, tillReducer } from './till-state.js';

const BATCH = {
  stockId: 11,
  itemName: 'Testamol 500mg',
  batchNo: 'TM-1',
  expiryDate: '2030-01-31',
};
const OTHER = { stockId: 12, itemName: 'Samplocillin 250mg', batchNo: 'SC-1', expiryDate: null };

/**
 * @param {import('./till-state.js').TillAction[]} actions
 * @returns {import('./till-state.js').TillState}
 */
const run = (actions) => actions.reduce(tillReducer, newSale());

describe('the till sale', () => {
  it('adds a batch, and adds to its line when the same batch comes again', () => {
    const state = run([
      { type: 'add', batch: BATCH, quantity: 1 },
      { type: 'add', batch: OTHER, quantity: 2 },
      { type: 'add', batch: BATCH, quantity: 3 },
    ]);
    expect(state.lines.map((line) => [line.stockId, line.quantity])).toEqual([
      [11, 4],
      [12, 2],
    ]);
    expect(state.selected).toBe(0);
  });

  it('keeps quantities whole and at least 1', () => {
    const state = run([
      { type: 'add', batch: BATCH, quantity: 2 },
      { type: 'step', index: 0, delta: -5 },
    ]);
    expect(state.lines[0].quantity).toBe(1);
    expect(
      tillReducer(state, { type: 'setQuantity', index: 0, quantity: 2.7 }).lines[0].quantity,
    ).toBe(2);
  });

  it('removes a line and keeps a line selected', () => {
    const state = run([
      { type: 'add', batch: BATCH, quantity: 1 },
      { type: 'add', batch: OTHER, quantity: 1 },
      { type: 'remove', index: 1 },
    ]);
    expect(state.lines).toHaveLength(1);
    expect(state.selected).toBe(0);
    expect(tillReducer(state, { type: 'remove', index: 0 }).selected).toBe(-1);
  });

  it('starts a new sale with a new request key when cleared', () => {
    const state = run([{ type: 'add', batch: BATCH, quantity: 1 }]);
    const cleared = tillReducer(state, { type: 'clear' });
    expect(cleared.lines).toEqual([]);
    expect(cleared.customer).toBeNull();
    expect(cleared.requestKey).not.toBe(state.requestKey);
  });

  it('sends only batches, quantities and discounts, and the customer as the API takes it', () => {
    const state = run([
      { type: 'add', batch: BATCH, quantity: 2 },
      { type: 'setDiscount', index: 0, discountPercent: 10 },
    ]);
    expect(linesForApi(state)).toEqual([{ stockId: 11, quantity: 2, discountPercent: 10 }]);
    expect(customerForApi(null)).toEqual({});
    expect(customerForApi({ id: 5, name: 'Test Customer', phone: null })).toEqual({
      customerId: 5,
    });
    expect(customerForApi({ name: 'Test Walk-in', phone: '0700000000' })).toEqual({
      customerName: 'Test Walk-in',
      customerPhone: '0700000000',
    });
  });
});

describe('what was typed in the search box', () => {
  it.each([
    ['testamol', 1, 'testamol'],
    ['3*testamol', 3, 'testamol'],
    [' 12 * 6001234500011', 12, '6001234500011'],
    ['3*', 3, ''],
    ['0*abc', 1, 'abc'],
  ])('reads %j as %i of %j', (text, quantity, query) => {
    expect(parseEntry(text)).toEqual({ quantity, query });
  });
});
