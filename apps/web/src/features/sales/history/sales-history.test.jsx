import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, renderRoutes, stubApi } from '@/test/render';

import SalesHistoryPage from './sales-history-page.jsx';

const APP_INFO = {
  data: {
    apiVersion: '1',
    pharmacy: { id: 1, name: 'Test Pharmacy', city: null, country: null },
    region: { locale: 'en-GB', currency: 'XXX', timeZone: 'UTC' },
  },
};

/** A made-up bill as the list returns it. */
const SUMMARY = {
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
};

const DETAIL = {
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
      batchNo: 'BATCH-OLD',
      expiryDate: '2026-01-31',
      expiredWhenSold: true,
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
};

const LIST = { data: [SUMMARY], meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 } };
const NOT_FOUND = {
  error: { code: 'NOT_FOUND', message: 'Bill not found', requestId: 'req-test-1' },
};

/**
 * @param {Record<string, (request: Request) => Response>} [overrides]
 * @param {string} [path]
 */
function renderPage(overrides = {}, path = '/sales/history') {
  const api = stubApi({
    'GET app-info': () => jsonResponse(200, APP_INFO),
    'GET sales/bills': () => jsonResponse(200, LIST),
    'GET sales/cashiers': () => jsonResponse(200, { data: [{ id: 2, name: 'Carl Cashier' }] }),
    'GET sales/bills/7': () => jsonResponse(200, { data: DETAIL }),
    ...overrides,
  });
  vi.stubGlobal('fetch', api.fetch);
  return {
    api,
    ...renderRoutes([{ path: '/sales/history', element: <SalesHistoryPage /> }], path),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Sales history', () => {
  it('lists bills with their old-data flags and filters by status', async () => {
    const { api } = renderPage();
    expect(await screen.findByText('TSB0102260001')).toBeInTheDocument();
    expect(screen.getByText('Short M-Pesa code')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'M-Pesa' })).toBeInTheDocument();
    // What was paid, where the legacy "Net" column was.
    expect(screen.getByRole('columnheader', { name: /Total paid/ })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^Net/ })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'cancelled');
    expect(
      api.calls.some((request) => new URL(request.url).searchParams.get('status') === 'cancelled'),
    ).toBe(true);
  });

  it('opens a bill with its items, the batch that expired before the sale, and payments', async () => {
    renderPage();
    await userEvent.click(await screen.findByText('TSB0102260001'));
    const dialog = await screen.findByRole('dialog', { name: 'Bill TSB0102260001' });
    expect(within(dialog).getByText('Testamol 500mg')).toBeInTheDocument();
    expect(within(dialog).getByText('Expired when sold')).toBeInTheDocument();
    expect(within(dialog).getByText('AB12')).toBeInTheDocument();
    expect(within(dialog).getByText('Old data to check')).toBeInTheDocument();
    // The names staff know from the legacy screens, with both prices.
    expect(within(dialog).getByRole('columnheader', { name: 'S.Price (Inc)' })).toBeInTheDocument();
    expect(within(dialog).getByRole('columnheader', { name: 'S Price' })).toBeInTheDocument();
    expect(within(dialog).getByText('580.00', { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByText('Net Amount')).toBeInTheDocument();
  });

  it('says so when a bill cannot be opened, with the reference for support', async () => {
    renderPage(
      { 'GET sales/bills/999': () => jsonResponse(404, NOT_FOUND) },
      '/sales/history?bill=999',
    );
    expect(await screen.findByText('Could not open the bill')).toBeInTheDocument();
    expect(screen.getByText('Bill not found. Reference: req-test-1')).toBeInTheDocument();
  });

  it('says so when the receipt cannot be reprinted', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    renderPage(
      {
        'GET sales/bills/7/receipt': () =>
          jsonResponse(500, {
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Something went wrong on our side. Please try again.',
            },
          }),
      },
      '/sales/history?bill=7',
    );
    const dialog = await screen.findByRole('dialog', { name: 'Bill TSB0102260001' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reprint receipt' }));
    expect(await screen.findByText('Could not reprint the receipt')).toBeInTheDocument();
  });

  it('says so when the list cannot be loaded', async () => {
    renderPage({
      'GET sales/bills': () =>
        jsonResponse(403, {
          error: { code: 'FORBIDDEN', message: 'You do not have permission to do this.' },
        }),
    });
    expect(await screen.findByText('Could not load the bills')).toBeInTheDocument();
  });
});
