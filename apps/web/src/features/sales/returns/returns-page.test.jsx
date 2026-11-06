import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, renderRoutes, stubApi } from '@/test/render';

import ReturnsPage from './returns-page.jsx';

const APP_INFO = {
  data: {
    apiVersion: '1',
    pharmacy: { id: 1, name: 'Test Pharmacy', city: null, country: null },
    region: { locale: 'en-GB', currency: 'XXX', timeZone: 'UTC' },
  },
};
/** Made-up returns: one from the new till, one from the old app. */
const RETURNS = [
  {
    id: 3,
    code: 'DPSR0611260001',
    at: '2026-11-06 10:42:00',
    billId: 7,
    billCode: 'DPSB0211260012',
    customerName: 'Jane Testcase',
    lineCount: 2,
    refund: '893.30',
    refundMethod: 'creditNote',
    reason: 'Treatment changed',
    requestedBy: 'Tina Cashier',
    approvedBy: 'Pat Pharmacist',
    hasReceipt: true,
  },
  {
    id: 2,
    code: 'DPSR0611260000',
    at: null,
    billId: 6,
    billCode: 'DPSB0111260004',
    customerName: null,
    lineCount: 1,
    refund: '116.00',
    refundMethod: 'cash',
    reason: 'Wrong medicine',
    requestedBy: 'Tina Cashier',
    approvedBy: null,
    hasReceipt: false,
  },
];
const NOTES = [
  {
    id: 9,
    code: 'DPCN0611260001',
    issuedOn: '2026-11-06',
    customerName: 'Jane Testcase',
    amount: '893.30',
    balance: '493.30',
    expiresOn: '2027-11-06',
    originalBillCode: 'DPSB0211260012',
    state: 'open',
  },
  {
    id: 8,
    code: 'DPCN0101250001',
    issuedOn: '2025-01-01',
    customerName: null,
    amount: '150.00',
    balance: '0.00',
    expiresOn: null,
    originalBillCode: null,
    state: 'usedUp',
  },
];

/** @type {string[]} */
let searches = [];

function setup() {
  searches = [];
  const api = stubApi({
    'GET app-info': () => jsonResponse(200, APP_INFO),
    'GET sales/returns': (/** @type {Request} */ request) => {
      searches.push(new URL(request.url).searchParams.toString());
      return jsonResponse(200, {
        data: RETURNS,
        meta: { page: 1, pageSize: 25, total: 2, totalPages: 1 },
      });
    },
    'GET sales/returns/approvers': () =>
      jsonResponse(200, { data: [{ id: 5, name: 'Pat Pharmacist' }] }),
    'GET sales/credit-notes': () =>
      jsonResponse(200, { data: NOTES, meta: { page: 1, pageSize: 25, total: 2, totalPages: 1 } }),
    'GET sales/credit-notes/DPCN0611260001/uses': () =>
      jsonResponse(200, {
        data: [
          {
            billId: 12,
            billCode: 'DPSB0711260003',
            usedAt: '2026-11-07 09:00:00',
            amount: '400.00',
            balanceAfter: '493.30',
            usedBy: 'Tina Cashier',
          },
        ],
      }),
  });
  vi.stubGlobal('fetch', api.fetch);
  renderRoutes([{ path: '/sales/returns', element: <ReturnsPage /> }], '/sales/returns');
  return api;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the Returns page', () => {
  it("lists the returns, with a receipt only for the new till's", async () => {
    setup();
    const table = await screen.findByRole('table', { name: 'Returns' });
    await within(table).findByText('DPSR0611260001');
    const [, ours, legacy] = within(table).getAllByRole('row');
    expect(ours).toHaveTextContent('Credit note');
    expect(ours).toHaveTextContent('Pat Pharmacist');
    expect(
      within(ours).getByRole('button', { name: /Print receipt of DPSR0611260001/ }),
    ).toBeInTheDocument();
    expect(legacy).toHaveTextContent('Old system');
    expect(within(legacy).queryByRole('button')).not.toBeInTheDocument();
  });

  it('searches and filters like Sales history: dates, refund and approver', async () => {
    setup();
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Search returns' }), 'jane');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Refunded as' }), 'mpesa');
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Approved by' }),
      await screen.findByRole('option', { name: 'Pat Pharmacist' }),
    );
    const last = () => new URLSearchParams(searches.at(-1));
    await vi.waitFor(() => expect(last().get('q')).toBe('jane'));
    expect(last().get('refundMethod')).toBe('mpesa');
    expect(last().get('approverId')).toBe('5');
    expect(last().get('sort')).toBe('-at');
  });

  it('lists the credit notes and shows each time one was used', async () => {
    setup();
    await userEvent.click(await screen.findByRole('tab', { name: 'Credit notes' }));
    const table = await screen.findByRole('table', { name: 'Credit notes' });
    expect(within(table).getByText('Open')).toBeInTheDocument();
    expect(within(table).getByText('Used up')).toBeInTheDocument();
    expect(within(table).getByText('No limit')).toBeInTheDocument();
    await userEvent.click(within(table).getByText('DPCN0611260001'));
    const note = await screen.findByRole('dialog', { name: 'Credit note DPCN0611260001' });
    expect(await within(note).findByText('DPSB0711260003')).toBeInTheDocument();
  });
});
