import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, renderRoutes, stubApi } from '@/test/render';

import MedicineTypesPage from './medicine-types-page.jsx';

/** Made-up items and the pharmacy's names for the schedule codes. */
const ITEMS = [
  { id: 1, active: true, name: 'Calmadol 50mg tabs', code: 'CAL50', scheduleCodeId: null },
  { id: 2, active: true, name: 'Hypotest 10mg tabs', code: 'HYP10', scheduleCodeId: 1 },
  { id: 3, active: true, name: 'Testamol 500mg tabs', code: 'TST500', scheduleCodeId: null },
];
const CODES = [
  { id: 1, name: 'Prescription only (H)' },
  { id: 2, name: 'Controlled (X)' },
];

function setup() {
  /** @type {Record<string, unknown>[]} */
  const posted = [];
  const api = stubApi({
    'GET masters/items': () =>
      jsonResponse(200, { data: ITEMS, meta: { page: 1, pageSize: 25, total: 3, totalPages: 1 } }),
    'GET lookups/schedule-codes': () => jsonResponse(200, { data: CODES }),
    'POST masters/items/medicine-type': async (request) => {
      const body = await request.json();
      posted.push(body);
      return jsonResponse(200, { data: { updated: body.itemIds.length } });
    },
  });
  vi.stubGlobal('fetch', api.fetch);
  renderRoutes(
    [{ path: '/masters/medicine-types', element: <MedicineTypesPage /> }],
    '/masters/medicine-types',
  );
  return { posted, api };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('medicine types', () => {
  it("shows each item's type by the pharmacy's names", async () => {
    setup();
    const row = (await screen.findByText('Hypotest 10mg tabs')).closest('tr');
    expect(
      within(/** @type {HTMLElement} */ (row)).getByText('Prescription only (H)'),
    ).toBeVisible();
  });

  it('marks the chosen items after asking first', async () => {
    const { posted } = setup();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Choose Calmadol 50mg tabs' }),
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Choose Testamol 500mg tabs' }));
    expect(screen.getByText('2 items chosen')).toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'New type' }),
      'Controlled (X)',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mark chosen items' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Mark 2 items as Controlled (X)?');
    expect(confirm).toHaveTextContent('Calmadol 50mg tabs, Testamol 500mg tabs');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Change type' }));
    await waitFor(() => expect(posted).toEqual([{ itemIds: [1, 3], scheduleCodeId: 2 }]));
    expect(await screen.findByText('0 items chosen')).toBeInTheDocument();
  });

  it('filters the list by type and can clear a type', async () => {
    const { posted, api } = setup();
    await screen.findByText('Hypotest 10mg tabs');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Show' }),
      'Prescription only (H)',
    );
    await waitFor(() =>
      expect(
        api.calls.some((call) => new URL(call.url).searchParams.get('scheduleCodeId') === '1'),
      ).toBe(true),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Choose this page' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'New type' }), 'No type');
    await userEvent.click(screen.getByRole('button', { name: 'Mark chosen items' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Change type' }),
    );
    await waitFor(() => expect(posted).toEqual([{ itemIds: [1, 2, 3], scheduleCodeId: null }]));
  });
});
