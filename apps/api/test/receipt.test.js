import { describe, expect, it } from 'vitest';

import { renderReceipt } from '../src/features/sales/receipt-pdf.js';
import { footerLinesOf } from '../src/features/sales/receipt-settings.js';

/** A made-up bill, as the bill detail returns it. */
const BILL = /** @type {any} */ ({
  id: 1,
  code: 'TSB0611260001',
  billDate: '2026-11-06',
  createdAt: '2026-11-06 10:41:00',
  customerName: null,
  cashierName: 'Test Cashier',
  prescriberName: null,
  remarks: null,
  status: 'paid',
  totals: {
    gross: '687.50',
    discount: '45.55',
    vat: '32.00',
    roundedOff: '0.05',
    net: '642.00',
    paid: '642.00',
    balance: '0.00',
  },
  lines: [
    {
      id: 1,
      itemName: 'Testamol 500mg',
      quantity: 2,
      amount: '232.00',
      taxCode: 'A',
      vatPercent: 16,
    },
  ],
  payments: [{ method: 'cash', amount: '642.00', reference: null }],
});

describe('the receipt', () => {
  it("reads the legacy receipt's closing lines, skipping empty ones and bad settings", () => {
    expect(
      footerLinesOf(
        JSON.stringify({
          centerContent: [{ text: ' Thank you ' }, { text: '' }, { text: 'Get well' }],
        }),
      ),
    ).toEqual(['Thank you', 'Get well']);
    expect(footerLinesOf('not json')).toEqual([]);
    expect(footerLinesOf(null)).toEqual([]);
  });

  it('renders an 80 mm PDF, original or copy', async () => {
    const context = {
      pharmacy: {
        name: 'Test Pharmacy',
        addressLines: ['Test Road'],
        phone: null,
        email: null,
        taxPin: null,
      },
      region: { locale: 'en-KE', currency: 'KES' },
      printedBy: 'Test Cashier',
      printedAt: '2026-11-06 10:42',
      taxCodes: [
        { code: 'A', percent: 16 },
        { code: 'E', percent: 0 },
      ],
      exemptCodes: ['E'],
      returnNote: 'Test note',
      footerLines: ['Thank you'],
    };
    for (const copy of [false, true]) {
      const pdf = await renderReceipt(BILL, { ...context, copy });
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
      // 80 mm is about 226.77 points wide.
      expect(pdf.toString('latin1')).toMatch(/MediaBox \[0 0 226\.77/);
    }
  });
});
