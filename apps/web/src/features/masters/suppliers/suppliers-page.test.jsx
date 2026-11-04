import { PERMISSIONS } from '@ihealth/shared/permissions';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { confirmChange, jsonResponse, renderRoutes, stubApi } from '@/test/render';
import { CURRENT_USER_KEY } from '@/features/auth/use-auth';

import SuppliersPage from './suppliers-page.jsx';

const SUPPLIER = {
  id: 3,
  active: true,
  name: 'Harleys Ltd',
  taxPin: 'P000000009Z',
  phone: '0722000000',
  contactFirstName: 'Jane',
  contactLastName: 'Wanjiru',
  creditDays: 30,
  countryId: 1,
  provinceId: 47,
  returnCreditTypeId: 3,
  returnCreditTypeName: 'CREDIT NOTE',
};

/**
 * @param {number[]} permissionIds
 */
function setup(permissionIds) {
  /** @type {Record<string, unknown>[]} */
  const posted = [];
  const api = stubApi({
    'GET masters/suppliers/3': () => jsonResponse(200, { data: SUPPLIER }),
    'GET masters/suppliers': () =>
      jsonResponse(200, {
        data: [SUPPLIER],
        meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
      }),
    'GET lookups/countries': () => jsonResponse(200, { data: [{ id: 1, name: 'Kenya' }] }),
    'GET lookups/provinces': () => jsonResponse(200, { data: [{ id: 47, name: 'Nairobi' }] }),
    'GET lookups/payment-types': () => jsonResponse(200, { data: [{ id: 7, name: 'CHEQUE' }] }),
    'GET lookups/return-credit-types': () =>
      jsonResponse(200, { data: [{ id: 3, name: 'CREDIT NOTE' }] }),
    'POST masters/suppliers': async (request) => {
      const body = await request.json();
      posted.push(body);
      return jsonResponse(201, { data: { ...SUPPLIER, ...body, id: 4 } });
    },
  });
  vi.stubGlobal('fetch', api.fetch);
  const view = renderRoutes(
    [{ path: '/masters/suppliers', element: <SuppliersPage /> }],
    '/masters/suppliers',
  );
  view.queryClient.setQueryData(CURRENT_USER_KEY, {
    employeeId: 1,
    firstName: 'A',
    lastName: 'B',
    roles: [],
    permissionIds,
  });
  return { ...view, posted };
}

afterEach(() => vi.unstubAllGlobals());

describe('SuppliersPage', () => {
  it('lists suppliers with their contact and credit days', async () => {
    setup([PERMISSIONS.MASTER_MASTERS_VIEW.id]);
    expect(await screen.findByText('Harleys Ltd')).toBeInTheDocument();
    expect(screen.getByText('Jane Wanjiru')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New supplier/ })).not.toBeInTheDocument();
  });

  it('shows the stored country and province once their lists arrive', async () => {
    setup([PERMISSIONS.MASTER_UPDATE_SUPPLIER.id]);
    await userEvent.click(await screen.findByText('Harleys Ltd'));
    const panel = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(panel).getByLabelText('Country')).toHaveDisplayValue('Kenya'),
    );
    await waitFor(() =>
      expect(within(panel).getByLabelText('Province or county')).toHaveDisplayValue('Nairobi'),
    );
  });

  it('lets "Update Supplier" create a supplier, sending the flags as booleans', async () => {
    const { posted } = setup([PERMISSIONS.MASTER_UPDATE_SUPPLIER.id]);
    await userEvent.click(await screen.findByRole('button', { name: /New supplier/ }));
    const panel = await screen.findByRole('dialog');
    await userEvent.type(within(panel).getByLabelText('Name'), 'Dawa Ltd');
    await userEvent.type(within(panel).getByLabelText('Tax PIN'), 'P000000001A');
    await userEvent.type(within(panel).getByLabelText('Address line 1'), 'Industrial Area');
    await userEvent.selectOptions(await within(panel).findByLabelText('Country'), 'Kenya');
    await userEvent.selectOptions(
      await within(panel).findByLabelText('Province or county'),
      'Nairobi',
    );
    await userEvent.selectOptions(
      within(panel).getByLabelText('Returns are credited as'),
      'CREDIT NOTE',
    );
    await userEvent.click(within(panel).getByLabelText('Phone orders'));
    await userEvent.click(within(panel).getByRole('button', { name: 'Create supplier' }));
    await confirmChange();

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      name: 'Dawa Ltd',
      supplies: 'both',
      countryId: 1,
      provinceId: 47,
      returnCreditTypeId: 3,
      allowPhoneOrders: true,
      allowOnlineOrders: false,
    });
  });
});
