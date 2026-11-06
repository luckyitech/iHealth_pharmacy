import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, renderRoutes, stubApi } from '@/test/render';

import { LabelsDialog } from './labels-dialog.jsx';

const APP_INFO = {
  data: {
    apiVersion: '1',
    pharmacy: { id: 1, name: 'Test Pharmacy', city: null, country: null },
    region: { locale: 'en-GB', currency: 'XXX', timeZone: 'UTC' },
  },
};
/** A made-up bill: an antibiotic with its usual instruction, and a plain item. */
const LABELS = {
  billId: 7,
  billCode: 'TSB0611260007',
  printedBefore: false,
  lines: [
    {
      lineId: 71,
      itemName: 'Amoxidemo 250mg caps',
      batchNo: 'AX-1',
      expiryDate: '2027-08-31',
      quantity: 15,
      medicineKind: 'antibiotic',
      suggestedText: 'Take one capsule',
      savedText: null,
      savedCopies: null,
    },
    {
      lineId: 72,
      itemName: 'Testamol 500mg',
      batchNo: 'TS-1',
      expiryDate: null,
      quantity: 1,
      medicineKind: null,
      suggestedText: null,
      savedText: null,
      savedCopies: null,
    },
  ],
};

function setup() {
  /** @type {unknown[]} */
  const printed = [];
  const api = stubApi({
    'GET app-info': () => jsonResponse(200, APP_INFO),
    'GET sales/bills/7/labels': () => jsonResponse(200, { data: LABELS }),
    'GET sales/till-settings': () =>
      jsonResponse(200, {
        data: { medicineTypes: [{ kind: 'antibiotic', code: 'H1', name: 'Antibiotic' }] },
      }),
    'POST sales/bills/7/labels': async (request) => {
      printed.push(await request.json());
      return new Response('%PDF-1.4', { headers: { 'Content-Type': 'application/pdf' } });
    },
  });
  vi.stubGlobal('fetch', api.fetch);
  vi.stubGlobal('open', () => ({ location: { href: '' }, close: () => {} }));
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:labels' }));
  const onClose = vi.fn();
  renderRoutes([{ path: '/', element: <LabelsDialog billId={7} onClose={onClose} /> }], '/');
  return { printed, onClose };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the labels window', () => {
  it('starts from the usual instruction, lets the dose be edited, and prints what is set', async () => {
    const { printed, onClose } = setup();
    const amox = await screen.findByRole('textbox', { name: 'Dose for Amoxidemo 250mg caps' });
    expect(amox).toHaveValue('Take one capsule');
    // A plain item starts with no sticker; an antibiotic with one.
    expect(screen.getByRole('button', { name: 'Print 1 label' })).toBeEnabled();

    await userEvent.type(amox, ' 3 times a day');
    // There is no box for the old label codes: the dose is typed.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'One sticker more for Amoxidemo 250mg caps' }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Print 2 labels' }));
    await waitFor(() =>
      expect(printed).toEqual([
        {
          labels: [
            { lineId: 71, text: 'Take one capsule 3 times a day', copies: 2 },
            { lineId: 72, text: '', copies: 0 },
          ],
        },
      ]),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('counts one sticker once a dose is typed, and none once it is erased', async () => {
    setup();
    const testamol = await screen.findByRole('textbox', { name: 'Dose for Testamol 500mg' });
    expect(screen.getByRole('button', { name: 'Print 1 label' })).toBeInTheDocument();
    await userEvent.type(testamol, 'Take two tablets');
    expect(screen.getByRole('button', { name: 'Print 2 labels' })).toBeInTheDocument();
    // A count set by hand stays while the dose is edited.
    await userEvent.click(
      screen.getByRole('button', { name: 'One sticker more for Testamol 500mg' }),
    );
    await userEvent.type(testamol, ' a day');
    expect(screen.getByRole('button', { name: 'Print 3 labels' })).toBeInTheDocument();
    await userEvent.clear(testamol);
    expect(screen.getByRole('button', { name: 'Print 1 label' })).toBeInTheDocument();
  });

  it('asks for a dose before printing a sticker without one', async () => {
    const { printed } = setup();
    await screen.findByRole('textbox', { name: 'Dose for Testamol 500mg' });
    await userEvent.click(
      screen.getByRole('button', { name: 'One sticker more for Testamol 500mg' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Print 2 labels' }));
    expect(await screen.findByText(/Enter the dose for every sticker/)).toBeInTheDocument();
    expect(printed).toEqual([]);
  });
});
