import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, renderRoutes, stubApi } from '@/test/render';

import ControlledRegisterPage from './controlled-register-page.jsx';

const APP_INFO = {
  data: {
    apiVersion: '1',
    pharmacy: { id: 1, name: 'Test Pharmacy', city: null, country: null },
    region: { locale: 'en-GB', currency: 'XXX', timeZone: 'UTC' },
  },
};
const ITEM = { id: 50, name: 'Calmadol 50mg tabs', code: 'CAL50', onHand: 117 };
/** A made-up register: stock received, then a sale to a made-up patient. */
const REGISTER = {
  item: ITEM,
  from: '2026-11-01',
  to: '2026-11-06',
  opening: 20,
  closing: 117,
  entries: [
    {
      at: '2026-11-02 09:05:00',
      kind: 'received',
      entryType: null,
      batchNo: 'CL-1',
      billId: null,
      billCode: null,
      invoiceNo: 'INV-TEST-1',
      patientName: null,
      patientIdNumber: null,
      doctorName: null,
      quantityIn: 100,
      quantityOut: 0,
      balance: 120,
      by: 'Mo Manager',
    },
    {
      at: '2026-11-03 16:40:00',
      kind: 'sold',
      entryType: null,
      batchNo: 'CL-1',
      billId: 9,
      billCode: 'TSB0311260009',
      invoiceNo: null,
      patientName: 'Jane Testcase',
      patientIdNumber: 'TEST1234',
      doctorName: 'Amani Demo',
      quantityIn: 0,
      quantityOut: 3,
      balance: 117,
      by: 'Carl Cashier',
    },
  ],
};

function setup() {
  const api = stubApi({
    'GET app-info': () => jsonResponse(200, APP_INFO),
    'GET sales/controlled-register/items': () => jsonResponse(200, { data: [ITEM] }),
    'GET sales/controlled-register': () => jsonResponse(200, { data: REGISTER }),
  });
  vi.stubGlobal('fetch', api.fetch);
  renderRoutes(
    [{ path: '/sales/controlled-register', element: <ControlledRegisterPage /> }],
    '/sales/controlled-register',
  );
  return api;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the controlled-drug register page', () => {
  it('asks for a medicine first, then shows its movements and balances', async () => {
    const api = setup();
    expect(await screen.findByText('Choose a controlled drug')).toBeInTheDocument();
    await userEvent.selectOptions(
      await screen.findByLabelText('Medicine'),
      'Calmadol 50mg tabs · 117 on hand',
    );
    const table = await screen.findByRole('table', { name: /Register of Calmadol 50mg tabs/ });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Opening balance20');
    expect(rows[2]).toHaveTextContent('Received');
    expect(rows[2]).toHaveTextContent('INV-TEST-1');
    expect(rows[3]).toHaveTextContent('Jane Testcase');
    expect(rows[3]).toHaveTextContent('ID TEST1234');
    expect(within(rows[3]).getByRole('link', { name: 'TSB0311260009' })).toHaveAttribute(
      'href',
      '/sales/history?bill=9',
    );
    expect(screen.getByText('Closing balance').nextSibling).toHaveTextContent('117');
    await waitFor(() =>
      expect(
        api.calls.some((call) => new URL(call.url).searchParams.get('itemId') === String(ITEM.id)),
      ).toBe(true),
    );
  });
});
