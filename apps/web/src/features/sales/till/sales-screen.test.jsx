import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, renderRoutes, stubApi } from '@/test/render';

import SalesScreenPage from './sales-screen-page.jsx';

const APP_INFO = {
  data: {
    apiVersion: '1',
    pharmacy: { id: 1, name: 'Test Pharmacy', city: null, country: null },
    region: { locale: 'en-GB', currency: 'XXX', timeZone: 'UTC' },
  },
};

/** A made-up batch, as the search returns it. */
const BATCH = {
  stockId: 11,
  itemId: 1,
  itemName: 'Testamol 500mg',
  itemCode: 'TST500',
  genericName: null,
  batchNo: 'TM-1',
  barcode: null,
  expiryDate: '2030-01-31',
  expired: false,
  available: 10,
  labelPrice: '116.00',
  vatPercent: 16,
};

/**
 * @param {{ quantity: number, discountPercent?: number }} line
 * @param {string | null} [medicineKind]
 * @returns {Record<string, unknown>}
 */
const quoteOf = ({ quantity, discountPercent = 0 }, medicineKind = null) => {
  const amount = (116 * quantity * (1 - discountPercent / 100)).toFixed(2);
  return {
    data: {
      lines: [
        {
          ...BATCH,
          quantity,
          discountPercent,
          taxCode: 'A',
          unitPrice: '100.0000',
          gross: (116 * quantity).toFixed(2),
          discount: '0.00',
          vat: '16.00',
          amount,
          warnings: [],
          needsApproval: discountPercent > 25 ? ['discountAboveLimit'] : [],
          batchLabelPrice: '116.00',
          medicineKind,
        },
      ],
      totals: {
        gross: (116 * quantity).toFixed(2),
        discount: '0.00',
        vat: '16.00',
        subtotal: amount,
        roundedOff: '0.00',
        net: amount,
      },
      quantity,
    },
  };
};

/**
 * @param {{ customers?: { id: number, name: string, phone: string | null }[], medicineKind?: string | null, controlledDrugRules?: boolean }} [options]
 * @returns {{ quotes: { lines: { discountPercent: number }[] }[], api: ReturnType<typeof stubApi> }}
 */
function renderPage({
  customers = [{ id: 5, name: 'Test Customer', phone: '0700000005' }],
  medicineKind = null,
  controlledDrugRules = true,
} = {}) {
  /** @type {{ lines: { discountPercent: number }[] }[]} */
  const quotes = [];
  const api = stubApi({
    'GET app-info': () => jsonResponse(200, APP_INFO),
    'GET sales/till-settings': () =>
      jsonResponse(200, {
        data: {
          selfDiscountLimit: 25,
          maxHeld: 30,
          quickCashNotes: [50, 100],
          chequeMaxAgeMonths: 6,
          canAcceptCheques: false,
          cancelAloneMinutes: 10,
          approvalReasons: ['Regular customer'],
          cancelReasons: ['Wrong item'],
          medicineTypes: [
            { kind: 'prescription', code: 'H', name: 'Prescription only' },
            { kind: 'controlled', code: 'X', name: 'Controlled' },
            { kind: 'antibiotic', code: 'H1', name: 'Antibiotic' },
          ],
          prescriptionPhotoMaxKb: 500,
          controlledDrugRules,
        },
      }),
    'GET sales/banks': () => jsonResponse(200, { data: [{ id: 1, name: 'Test Bank' }] }),
    'GET sales/held': () => jsonResponse(200, { data: [] }),
    'GET sales/batches': () =>
      jsonResponse(200, { data: { batches: [{ ...BATCH, medicineKind }], scanned: false } }),
    'GET sales/doctors': () =>
      jsonResponse(200, {
        data: [
          {
            id: 7,
            name: 'Amani Demo',
            licenseNumber: 'TEST-0001',
            hospitalId: 3,
            hospitalName: 'Sample Medical Centre',
          },
        ],
      }),
    'GET sales/customers': () => jsonResponse(200, { data: customers }),
    'POST sales/approvals': () =>
      jsonResponse(201, {
        data: {
          token: '11111111-2222-4333-8444-555555555555',
          approvedBy: 'Test Approver',
          items: [],
          givenAway: '34.80',
        },
      }),
    'POST sales/quote': async (request) => {
      const body = await request.json();
      quotes.push(body);
      return jsonResponse(200, quoteOf(body.lines[0], medicineKind));
    },
  });
  vi.stubGlobal('fetch', api.fetch);
  renderRoutes([{ path: '/sales/new', element: <SalesScreenPage /> }], '/sales/new');
  return { quotes, api };
}

/**
 * @returns {Promise<void>}
 */
async function addTestamol() {
  await userEvent.type(screen.getByRole('combobox', { name: 'Find an item' }), 'testa');
  await screen.findByRole('option', { name: /Testamol 500mg/ });
  await userEvent.keyboard('{Enter}');
  await screen.findByRole('textbox', { name: 'Quantity of Testamol 500mg' });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the sales screen', () => {
  it('starts with a walk-in and an empty sale, with the search ready', async () => {
    renderPage();
    expect(await screen.findByText('No items yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Customer\s*Walk-in/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Find an item' })).toHaveFocus(),
    );
  });

  it('offers registered customers as the name is typed, and picks one with Enter', async () => {
    renderPage();
    await screen.findByText('No items yet');
    await userEvent.keyboard('{F2}');
    const name = await screen.findByRole('combobox', { name: /Name/ });
    await userEvent.type(name, 'te');
    expect(await screen.findByRole('option', { name: /Test Customer/ })).toHaveTextContent(
      'Customer no. 5',
    );
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: /Customer\s*Test Customer/ })).toBeInTheDocument();
  });

  it('keeps a typed name when no one matches, and Escape closes only the list', async () => {
    const { api } = renderPage({ customers: [] });
    const searches = () => api.calls.filter((call) => call.url.includes('sales/customers'));
    await screen.findByText('No items yet');
    await userEvent.keyboard('{F2}');
    await userEvent.type(await screen.findByRole('combobox', { name: /Name/ }), 'Nobody Known');
    expect(await screen.findByText('No customer found')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('No customer found')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Customer' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Use this name' }));
    expect(screen.getByRole('button', { name: /Customer\s*Nobody Known/ })).toBeInTheDocument();
    expect(new URL(searches().at(-1)?.url ?? '').searchParams.get('q')).toBe('Nobody Known');
  });

  it('asks for the prescription of a prescription-only medicine, without requiring it', async () => {
    renderPage({ medicineKind: 'prescription' });
    expect(screen.queryByRole('region', { name: /Prescription/ })).not.toBeInTheDocument();
    await addTestamol();
    expect(await screen.findByTitle('Prescription only')).toHaveTextContent('Rx');
    const strip = await screen.findByRole('region', { name: /Prescription/ });
    expect(strip).toHaveTextContent('recommended · 1 item needs one');

    await userEvent.keyboard('{F3}');
    const doctor = within(strip).getByRole('combobox', { name: 'Doctor' });
    expect(doctor).toHaveFocus();
    await userEvent.type(doctor, 'am');
    await userEvent.click(await screen.findByRole('option', { name: /Amani Demo/ }));
    expect(doctor).toHaveValue('Amani Demo');
    // The doctor's own hospital is filled in.
    expect(within(strip).getByRole('combobox', { name: 'Hospital' })).toHaveValue(
      'Sample Medical Centre',
    );
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Pay/ })[0]).toBeEnabled());
  });

  it('will not take payment for a controlled drug until the register details are in', async () => {
    renderPage({ medicineKind: 'controlled' });
    await addTestamol();
    const strip = await screen.findByRole('region', { name: /Controlled drug/ });
    expect(strip).toHaveTextContent('required for the register');
    await waitFor(() =>
      expect(
        screen.getAllByText(
          /Fill in the patient's name, phone, ID number, doctor and prescription date/,
        )[0],
      ).toBeInTheDocument(),
    );
    expect(screen.getAllByRole('button', { name: /^Pay/ })[0]).toBeDisabled();

    await userEvent.type(
      within(strip).getByRole('combobox', { name: /Patient's name/ }),
      'Jane Testcase',
    );
    await userEvent.type(within(strip).getByRole('textbox', { name: /Phone/ }), '0700000104');
    await userEvent.type(
      within(strip).getByRole('textbox', { name: /ID or passport/ }),
      'TEST1234',
    );
    await userEvent.type(within(strip).getByRole('combobox', { name: /Doctor/ }), 'am');
    await userEvent.click(await screen.findByRole('option', { name: /Amani Demo/ }));
    expect(screen.getAllByText(/Fill in the prescription date for the/)[0]).toBeInTheDocument();
    await userEvent.type(within(strip).getByLabelText(/Prescription date/), '2026-11-01');
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Pay/ })[0]).toBeEnabled());
    expect(screen.getByRole('button', { name: /Customer\s*Jane Testcase/ })).toBeInTheDocument();
  });

  it('takes payment for a controlled drug without the details when the pharmacy turned the rules off', async () => {
    renderPage({ medicineKind: 'controlled', controlledDrugRules: false });
    await addTestamol();
    const strip = await screen.findByRole('region', { name: /Controlled drug/ });
    expect(strip).toHaveTextContent('recommended for the register');
    expect(within(strip).getByRole('combobox', { name: /Patient's name/ })).not.toBeRequired();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Pay/ })[0]).toBeEnabled());
  });

  it('asks a second person to approve a discount above the limit, then takes the payment', async () => {
    const { quotes } = renderPage();
    await addTestamol();
    await userEvent.keyboard('{F4}');
    const field = await screen.findByRole('textbox', { name: 'Discount (%)' });
    await userEvent.clear(field);
    await userEvent.type(field, '30');
    await userEvent.click(screen.getByRole('button', { name: 'Apply discount' }));
    await waitFor(() => expect(quotes.at(-1)?.lines[0].discountPercent).toBe(30));
    expect(
      await screen.findByText(/Discount above the limit · needs approval/),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Get approval/ })[0]).toBeEnabled(),
    );
    await userEvent.keyboard('{F9}');
    const approval = await screen.findByRole('dialog', { name: 'Approval needed' });
    await userEvent.click(within(approval).getByRole('button', { name: /Approve and pay/ }));
    expect(within(approval).getByText('Enter a reason')).toBeInTheDocument();
    expect(within(approval).getByText("Enter the approver's PIN")).toBeInTheDocument();

    await userEvent.click(within(approval).getByRole('button', { name: 'Regular customer' }));
    await userEvent.type(within(approval).getByLabelText(/Approver's username/), 'test.approver');
    await userEvent.type(within(approval).getByLabelText(/Approver's PIN/), '4321');
    await userEvent.click(within(approval).getByRole('button', { name: /Approve and pay/ }));
    expect(await screen.findByRole('textbox', { name: 'Cash received' })).toBeInTheDocument();
  });

  it('opens the payment window with F9, the exact cash filled in', async () => {
    renderPage();
    await addTestamol();
    // The totals panel and the phone bar both have a Pay button; only one shows at a time.
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Pay/ })[0]).toBeEnabled());
    await userEvent.keyboard('{F9}');
    const cash = await screen.findByRole('textbox', { name: 'Cash received' });
    expect(cash).toHaveValue('116.00');
    expect(screen.getByRole('button', { name: /Complete sale/ })).toBeInTheDocument();
    // Cheques are offered only to people allowed to take them.
    expect(screen.getByRole('button', { name: /Cheque/ })).toBeDisabled();
  });

  it('adds a card for part of the bill, asking for its approval code', async () => {
    renderPage();
    await addTestamol();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Pay/ })[0]).toBeEnabled());
    await userEvent.keyboard('{F9}');
    await screen.findByRole('textbox', { name: 'Cash received' });
    await userEvent.click(screen.getByRole('button', { name: /^Card/ }));
    const amount = within(screen.getByRole('group', { name: 'Card' })).getByRole('textbox', {
      name: 'Amount',
    });
    await userEvent.clear(amount);
    await userEvent.type(amount, '100');
    await userEvent.click(screen.getByRole('button', { name: /Complete sale/ }));
    expect(
      await screen.findByText('Enter the approval code from the card machine slip'),
    ).toBeInTheDocument();
  });
});
