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
  totalPaid: '1160.00',
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
  approvals: [],
  audit: {
    createdBy: 'Carl Cashier',
    createdAt: '2026-02-01 09:15:00',
    updatedBy: 'Carl Cashier',
    updatedAt: '2026-02-01 09:15:00',
  },
});

/**
 * @param {number} minutesAgo
 * @returns {string} That moment as a legacy wall-clock time in UTC (the mock pharmacy's zone).
 */
const wallClock = (minutesAgo) =>
  new Date(Date.now() - minutesAgo * 60_000).toISOString().slice(0, 19).replace('T', ' ');

/** A made-up bill of today, made 20 minutes ago by the signed-in cashier. */
const TODAY_BILL = Object.freeze({
  ...DETAIL,
  id: 8,
  code: 'TSB0611260008',
  billDate: wallClock(20).slice(0, 10),
  createdAt: wallClock(20),
  status: 'paid',
  flags: [],
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
    if (path === 'sales/bills/8') return json({ data: TODAY_BILL });
    if (path === 'sales/bills/8/cancel') return route.fulfill({ status: 204, body: '' });
    if (path === 'app-info')
      return json({
        data: {
          apiVersion: '1',
          pharmacy: { id: 1, name: 'Test Pharmacy', city: null, country: null },
          region: { locale: 'en-KE', currency: 'KES', timeZone: 'UTC' },
        },
      });
    if (path === 'sales/till-settings')
      return json({
        data: {
          selfDiscountLimit: 25,
          maxHeld: 30,
          quickCashNotes: [100],
          chequeMaxAgeMonths: 6,
          canAcceptCheques: false,
          cancelAloneMinutes: 10,
          approvalReasons: [],
          cancelReasons: ['Customer changed mind'],
        },
      });
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
  await page.goto('/sales/history');
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

test('cancels a bill of today with a second person after the cashier’s 10 minutes', async ({
  page,
}) => {
  await page.goto('/sales/history?bill=8');
  const dialog = page.getByRole('dialog', { name: 'Bill TSB0611260008' });
  await dialog.getByRole('button', { name: 'Cancel bill' }).click();
  const cancel = page.getByRole('dialog', { name: 'Cancel bill TSB0611260008?' });
  await expect(cancel.getByText(/A second person must approve/)).toBeVisible();
  await cancel.getByRole('button', { name: 'Approve and cancel' }).click();
  await expect(cancel.getByText('Enter a reason')).toBeVisible();
  await cancel.getByRole('button', { name: 'Customer changed mind' }).click();
  await cancel.getByLabel(/Approver's username/).fill('pat.pharmacist');
  await cancel.getByLabel(/Approver's PIN/).fill('4321');
  await cancel.getByRole('button', { name: 'Approve and cancel' }).click();
  await expect(page.getByText('Bill TSB0611260008 cancelled')).toBeVisible();
});
