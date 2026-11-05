import { expect, test } from '@playwright/test';

/** A made-up bill, as the list and the detail return it. */
const SUMMARY = Object.freeze({
  id: 7,
  code: 'TSB0102260001',
  billDate: '2026-02-01',
  createdAt: '2026-02-01 09:15:00',
  customerName: 'Test Customer',
  customerPhone: '0700 000 101',
  cashierId: 2,
  cashierName: 'Carl Cashier',
  lineCount: 1,
  netAmount: '1160.00',
  paidAmount: '1160.00',
  balance: '0.00',
  status: 'paid',
  paymentMethods: ['mpesa'],
  flags: ['shortMpesaCode'],
});

const DETAIL = Object.freeze({
  ...SUMMARY,
  prescriberName: null,
  hospitalName: null,
  prescriptionDate: null,
  remarks: null,
  totals: {
    gross: '1160.00',
    discount: '0.00',
    vat: '160.00',
    roundedOff: '0.00',
    net: '1160.00',
    paid: '1160.00',
    balance: '0.00',
  },
  lines: [
    {
      id: 1,
      itemId: 1,
      itemName: 'Testamol 500mg',
      itemCode: 'TST500',
      batchNo: 'BATCH-OK',
      expiryDate: '2030-12-31',
      expiredWhenSold: false,
      quantity: 2,
      unitPrice: '500.00',
      labelPrice: '580.00',
      discountPercent: 0,
      vatPercent: 16,
      taxCode: 'A',
      amount: '1160.00',
    },
  ],
  payments: [{ method: 'mpesa', amount: '1160.00', reference: 'AB12' }],
  audit: {
    createdBy: 'Carl Cashier',
    createdAt: '2026-02-01 09:15:00',
    updatedBy: 'Carl Cashier',
    updatedAt: '2026-02-01 09:15:00',
  },
});

/** A minimal valid PDF, standing in for the receipt. */
const PDF =
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';

/**
 * A signed-in cashier with Sales permissions, and one bill.
 *
 * @param {import('@playwright/test').Page} page
 */
async function mockApi(page) {
  const user = {
    employeeId: 2,
    username: 'smoke.cashier',
    firstName: 'Smoke',
    lastName: 'Cashier',
    email: 'cashier@example.test',
    pharmacyId: 1,
    roles: [],
    permissionIds: [6, 8],
  };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/', '');
    /**
     * @param {unknown} body
     * @param {number} [status]
     * @returns {Promise<void>}
     */
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === 'auth/me') return json({ data: user });
    if (path === 'auth/csrf') return json({ data: { csrfToken: 'smoke' } });
    if (path === 'sales/cashiers') return json({ data: [{ id: 2, name: 'Carl Cashier' }] });
    if (path === 'sales/bills')
      return json({ data: [SUMMARY], meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 } });
    if (path === 'sales/bills/7') return json({ data: DETAIL });
    if (path === 'sales/bills/7/receipt')
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: PDF });
    return json(
      { error: { code: 'NOT_FOUND', message: 'Bill not found', requestId: 'req-smoke' } },
      404,
    );
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('lists bills, opens one, and reprints its receipt', async ({ page }) => {
  await page.goto('/sales');
  await expect(page).toHaveURL(/\/sales\/history$/);
  await page.getByText('TSB0102260001').click();

  const dialog = page.getByRole('dialog', { name: 'Bill TSB0102260001' });
  await expect(dialog.getByText('Testamol 500mg')).toBeVisible();
  await expect(dialog.getByText('Old data to check')).toBeVisible();
  await expect(page).toHaveURL(/\?bill=7$/);

  // The receipt opens in a new tab (headless browsers save PDFs instead of showing them).
  const [receipt] = await Promise.all([
    page.waitForResponse('**/api/v1/sales/bills/7/receipt'),
    page.waitForEvent('popup'),
    dialog.getByRole('button', { name: 'Reprint receipt' }).click(),
  ]);
  expect(receipt.headers()['content-type']).toBe('application/pdf');
  await expect(page.getByText('Could not reprint the receipt')).toHaveCount(0);
});

test('says clearly when a bill cannot be found', async ({ page }) => {
  await page.goto('/sales/history?bill=404');
  await expect(page.getByText('Could not open the bill')).toBeVisible();
  // The notification gives the reference for support (the dialog repeats it).
  await expect(page.getByText(/Reference: req-smoke/).first()).toBeVisible();
});
