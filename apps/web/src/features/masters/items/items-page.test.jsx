import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, renderRoutes, stubApi } from '@/test/render';
import { CURRENT_USER_KEY } from '@/features/auth/use-auth';

import ItemsPage from './items-page.jsx';

const META = { page: 1, pageSize: 25, total: 1, totalPages: 1 };

/**
 * @param {Record<string, unknown>[]} rows
 * @returns {() => Response}
 */
const list = (rows) => () =>
  jsonResponse(200, { data: rows, meta: { ...META, total: rows.length } });

const ITEM_ROW = {
  id: 7,
  name: 'Paracetamol 500mg',
  code: 'IC0000007',
  groupName: 'Tablets',
  manufacturerName: 'Cosmos Ltd',
  taxCategoryName: 'A (16%)',
  purchaseUnitId: 10,
  purchaseUnitName: 'STRIPS',
  active: true,
};

function setup() {
  /** @type {Record<string, unknown>[]} */
  const posted = [];
  const api = stubApi({
    'GET masters/items/7': () => jsonResponse(200, { data: ITEM_ROW }),
    'GET masters/items': list([ITEM_ROW]),
    'GET masters/item-groups': list([{ id: 1, name: 'Tablets' }]),
    'GET masters/item-categories': list([]),
    'GET masters/specializations': list([]),
    'GET masters/units-of-measure': list([{ id: 3, name: 'Piece' }]),
    'GET masters/item-forms': list([{ id: 4, name: 'Tablet' }]),
    'GET masters/manufacturers': (request) =>
      list(
        new URL(request.url).searchParams.get('q') === 'cos'
          ? [{ id: 9, name: 'Cosmos Ltd' }]
          : [
              { id: 8, name: 'Beta Healthcare' },
              { id: 9, name: 'Cosmos Ltd' },
            ],
      )(),
    'GET lookups/tax-categories': () => jsonResponse(200, { data: [{ id: 5, name: 'A (16%)' }] }),
    'GET lookups/schedule-codes': () => jsonResponse(200, { data: [] }),
    'GET lookups/latin-codes': () => jsonResponse(200, { data: [] }),
    'POST masters/items': async (request) => {
      const body = await request.json();
      posted.push(body);
      return jsonResponse(201, { data: { id: 10, ...body } });
    },
  });
  vi.stubGlobal('fetch', api.fetch);
  const view = renderRoutes([{ path: '/masters/items', element: <ItemsPage /> }], '/masters/items');
  view.queryClient.setQueryData(CURRENT_USER_KEY, {
    employeeId: 1,
    firstName: 'A',
    lastName: 'B',
    roles: [],
    permissionIds: [1],
  });
  return { ...view, api, posted };
}

afterEach(() => vi.unstubAllGlobals());

/**
 * @param {HTMLElement} panel
 * @param {string} label
 * @param {string} search
 * @param {string} option
 */
async function pick(panel, label, search, option) {
  await userEvent.click(within(panel).getByRole('combobox', { name: label }));
  const box = await screen.findByRole('textbox', { name: `Search ${label.toLowerCase()}` });
  await userEvent.type(box, search);
  await userEvent.click(await screen.findByRole('option', { name: option }));
}

describe('ItemsPage', () => {
  it('lists items with the names of their group, manufacturer and tax', async () => {
    setup();
    expect(await screen.findByText('Paracetamol 500mg')).toBeInTheDocument();
    expect(screen.getByText('Cosmos Ltd')).toBeInTheDocument();
    expect(screen.getByText('A (16%)')).toBeInTheDocument();
  });

  it('creates an item, picking the manufacturer by searching', async () => {
    const { posted } = setup();
    await userEvent.click(await screen.findByRole('button', { name: /New item/ }));
    const panel = await screen.findByRole('dialog');

    await userEvent.type(within(panel).getByLabelText('Name'), 'Ibuprofen 200mg');
    await userEvent.selectOptions(await within(panel).findByLabelText('Group'), 'Tablets');
    await pick(panel, 'Dosage form', 'tab', 'Tablet');
    await pick(panel, 'Manufacturer', 'cos', 'Cosmos Ltd');
    expect(within(panel).getByRole('combobox', { name: 'Manufacturer' })).toHaveTextContent(
      'Cosmos Ltd',
    );
    await userEvent.selectOptions(within(panel).getByLabelText('Purchase unit'), 'Piece');
    await userEvent.selectOptions(within(panel).getByLabelText('Issue unit'), 'Piece');
    await userEvent.selectOptions(await within(panel).findByLabelText('Tax category'), 'A (16%)');
    await userEvent.click(within(panel).getByRole('button', { name: 'Create item' }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      name: 'Ibuprofen 200mg',
      productKind: 'medical',
      groupId: 1,
      formId: 4,
      manufacturerId: 9,
      purchaseUnitId: 3,
      issueUnitId: 3,
      taxCategoryId: 5,
      code: null,
    });
  });

  it("keeps showing a record's choice that is no longer offered", async () => {
    setup();
    await userEvent.click(await screen.findByText('Paracetamol 500mg'));
    const panel = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(panel).getByLabelText('Purchase unit')).toHaveDisplayValue(
        'STRIPS (no longer offered)',
      ),
    );
  });

  it('names the missing essentials before calling the API', async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole('button', { name: /New item/ }));
    const panel = await screen.findByRole('dialog');
    await userEvent.type(within(panel).getByLabelText('Name'), 'Incomplete');
    await userEvent.click(within(panel).getByRole('button', { name: 'Create item' }));
    expect(await within(panel).findByText('Choose a manufacturer')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Tax category')).toHaveAttribute('aria-invalid', 'true');
    expect(api.calls.some((call) => call.method === 'POST')).toBe(false);
  });
});
