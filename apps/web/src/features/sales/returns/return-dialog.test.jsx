import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, renderRoutes, stubApi } from '@/test/render';

import { ReturnDialog } from './return-dialog.jsx';

const APP_INFO = {
  data: {
    apiVersion: '1',
    pharmacy: { id: 1, name: 'Test Pharmacy', city: null, country: null },
    region: { locale: 'en-GB', currency: 'XXX', timeZone: 'UTC' },
  },
};
/** A made-up bill with two lines, one partly returned before. */
const RETURNABLE = {
  billId: 7,
  billCode: 'TSB0211260012',
  billDate: '2026-11-02',
  customerName: 'Jane Testcase',
  customerId: 5,
  daysSince: 4,
  returnDays: 30,
  blocked: null,
  lines: [
    {
      lineId: 71,
      itemName: 'Amoxidemo 250mg caps',
      batchNo: 'AX-1',
      sold: 15,
      returned: 0,
      returnable: 15,
      unitRefund: '25.33',
    },
    {
      lineId: 72,
      itemName: 'Hypotest 10mg tabs',
      batchNo: 'HT-1',
      sold: 2,
      returned: 1,
      returnable: 1,
      unitRefund: '640.00',
    },
  ],
};

/**
 * @param {{ returnable?: Record<string, unknown>, failApproval?: boolean }} [options]
 */
function setup({ returnable = RETURNABLE, failApproval = false } = {}) {
  /** @type {any[]} */
  const sent = [];
  const api = stubApi({
    'GET app-info': () => jsonResponse(200, APP_INFO),
    'GET sales/till-settings': () =>
      jsonResponse(200, { data: { returnReasons: ['Treatment changed', 'Wrong medicine'] } }),
    'GET sales/bills/7/returnable': () => jsonResponse(200, { data: returnable }),
    'POST sales/bills/7/returns': async (request) => {
      sent.push(await request.json());
      if (failApproval)
        return jsonResponse(400, {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Some fields are invalid.',
            details: [
              {
                path: 'body.approver',
                message: "You can't approve your own return. Ask someone else.",
              },
            ],
          },
        });
      return jsonResponse(201, {
        data: {
          id: 3,
          code: 'DPSR0611260001',
          billId: 7,
          billCode: 'TSB0211260012',
          refund: '893.30',
          refundMethod: 'creditNote',
          approvedBy: 'Pat Pharmacist',
          creditNote: {
            id: 9,
            code: 'DPCN0611260001',
            customerName: 'Jane Testcase',
            amount: '893.30',
            balance: '893.30',
            expiresOn: '2027-11-06',
            originalBillCode: 'TSB0211260012',
          },
        },
      });
    },
  });
  vi.stubGlobal('fetch', api.fetch);
  renderRoutes([{ path: '/', element: <ReturnDialog billId={7} onClose={() => {}} /> }], '/');
  return { sent };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** @returns {Promise<void>} */
async function fillApproval() {
  await userEvent.click(screen.getByRole('button', { name: 'Treatment changed' }));
  await userEvent.click(screen.getByRole('button', { name: 'Credit note' }));
  await userEvent.type(screen.getByLabelText(/Approver's username/), 'pat.pharmacist');
  await userEvent.type(screen.getByLabelText(/Approver's PIN/), '4321');
}

describe('returning goods', () => {
  it('returns part of a line to the shelf and writes off the rest, as a credit note', async () => {
    const { sent } = setup();
    await userEvent.click(
      await screen.findByRole('button', { name: 'One more Amoxidemo 250mg caps' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'One more Hypotest 10mg tabs' }));
    // Only what is left can come back.
    expect(screen.getByRole('button', { name: 'One more Hypotest 10mg tabs' })).toBeDisabled();
    const condition = screen.getByRole('group', { name: 'Condition of Hypotest 10mg tabs' });
    await userEvent.click(within(condition).getByRole('button', { name: "Don't restock" }));
    expect(screen.getByText(/Refund · 2 units/)).toHaveTextContent('665.33');
    await fillApproval();
    await userEvent.click(screen.getByRole('button', { name: 'Approve and return' }));
    await waitFor(() =>
      expect(sent).toEqual([
        {
          lines: [
            { lineId: 71, quantity: 1, condition: 'restock' },
            { lineId: 72, quantity: 1, condition: 'writeOff' },
          ],
          reason: 'Treatment changed',
          refund: 'creditNote',
          approver: 'pat.pharmacist',
          pin: '4321',
        },
      ]),
    );
    expect(await screen.findByText('DPCN0611260001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Print receipt/ })).toBeInTheDocument();
  });

  it('asks for the M-Pesa code and the approver, and shows a refusal under the field', async () => {
    const { sent } = setup({ failApproval: true });
    await userEvent.click(
      await screen.findByRole('button', { name: 'One more Amoxidemo 250mg caps' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'M-Pesa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve and return' }));
    expect(screen.getByText('Enter the code of the M-Pesa payment sent back')).toBeInTheDocument();
    expect(sent).toEqual([]);
    await userEvent.type(screen.getByLabelText(/Code of the M-Pesa payment/), 'QK52AB1XYZ');
    await userEvent.click(screen.getByRole('button', { name: 'Wrong medicine' }));
    await userEvent.type(screen.getByLabelText(/Approver's username/), 'test.cashier');
    await userEvent.type(screen.getByLabelText(/Approver's PIN/), '0000');
    await userEvent.click(screen.getByRole('button', { name: 'Approve and return' }));
    expect(await screen.findAllByText(/can't approve your own return/)).not.toHaveLength(0);
  });

  it('says why a bill cannot be returned', async () => {
    setup({
      returnable: {
        ...RETURNABLE,
        blocked: 'This bill was cancelled, so nothing on it can be returned',
      },
    });
    expect(await screen.findByText(/This bill was cancelled/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve and return' })).not.toBeInTheDocument();
  });
});
