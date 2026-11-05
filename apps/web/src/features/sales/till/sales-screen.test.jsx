import { screen, waitFor } from '@testing-library/react';
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
 * @returns {Record<string, unknown>}
 */
const quoteOf = ({ quantity, discountPercent = 0 }) => {
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

function renderPage() {
  /** @type {{ lines: { discountPercent: number }[] }[]} */
  const quotes = [];
  const api = stubApi({
    'GET app-info': () => jsonResponse(200, APP_INFO),
    'GET sales/till-settings': () =>
      jsonResponse(200, {
        data: { selfDiscountLimit: 25, maxHeld: 30, quickCashNotes: [50, 100] },
      }),
    'GET sales/held': () => jsonResponse(200, { data: [] }),
    'GET sales/batches': () => jsonResponse(200, { data: { batches: [BATCH], scanned: false } }),
    'GET sales/customers': () =>
      jsonResponse(200, { data: [{ id: 5, name: 'Test Customer', phone: '0700000005' }] }),
    'POST sales/quote': async (request) => {
      const body = await request.json();
      quotes.push(body);
      return jsonResponse(200, quoteOf(body.lines[0]));
    },
  });
  vi.stubGlobal('fetch', api.fetch);
  renderRoutes([{ path: '/sales/new', element: <SalesScreenPage /> }], '/sales/new');
  return { quotes };
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

  it('puts a registered customer on the sale with F2', async () => {
    renderPage();
    await screen.findByText('No items yet');
    await userEvent.keyboard('{F2}');
    await userEvent.type(
      await screen.findByRole('searchbox', { name: /Search customers/ }),
      'test',
    );
    await userEvent.click(await screen.findByRole('button', { name: /Test Customer/ }));
    expect(screen.getByRole('button', { name: /Customer\s*Test Customer/ })).toBeInTheDocument();
  });

  it('refuses a discount above what a cashier may give alone', async () => {
    const { quotes } = renderPage();
    await addTestamol();
    await userEvent.keyboard('{F4}');
    const field = await screen.findByRole('textbox', { name: 'Discount (%)' });
    await userEvent.clear(field);
    await userEvent.type(field, '30');
    await userEvent.click(screen.getByRole('button', { name: 'Apply discount' }));
    expect(
      await screen.findByText("Above 25% needs a second person's approval"),
    ).toBeInTheDocument();

    await userEvent.clear(field);
    await userEvent.type(field, '10');
    await userEvent.click(screen.getByRole('button', { name: 'Apply discount' }));
    await waitFor(() => expect(quotes.at(-1)?.lines[0].discountPercent).toBe(10));
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
  });
});
