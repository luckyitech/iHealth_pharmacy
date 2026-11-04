import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, recordPageRoutes, renderRoutes, stubApi } from '@/test/render';
import { CURRENT_USER_KEY } from '@/features/auth/use-auth';

import CustomersPage, { EditorPage } from './customers-page.jsx';

function setup() {
  /** @type {Record<string, unknown>[]} */
  const posted = [];
  const api = stubApi({
    'GET masters/customers': () =>
      jsonResponse(200, {
        data: [
          {
            id: 1,
            active: true,
            kind: 'individual',
            firstName: 'Test',
            lastName: 'Customer',
            phone: '0700000101',
            city: 'Nairobi',
          },
          {
            id: 2,
            active: true,
            kind: 'corporate',
            firstName: 'Accounts',
            lastName: null,
            phone: '0200000000',
            organisation: 'Dawa Ltd',
            city: null,
          },
        ],
        meta: { page: 1, pageSize: 25, total: 2, totalPages: 1 },
      }),
    'GET lookups/countries': () => jsonResponse(200, { data: [{ id: 1, name: 'Kenya' }] }),
    'GET lookups/provinces': () => jsonResponse(200, { data: [{ id: 47, name: 'Nairobi' }] }),
    'POST masters/customers': async (request) => {
      const body = await request.json();
      posted.push(body);
      return jsonResponse(201, { data: { id: 3, active: true, ...body } });
    },
  });
  vi.stubGlobal('fetch', api.fetch);
  const view = renderRoutes(
    recordPageRoutes('/masters/customers', <CustomersPage />, <EditorPage />),
    '/masters/customers',
  );
  view.queryClient.setQueryData(CURRENT_USER_KEY, {
    employeeId: 1,
    firstName: 'A',
    lastName: 'B',
    roles: [],
    permissionIds: [1],
  });
  return { ...view, posted };
}

afterEach(() => vi.unstubAllGlobals());

describe('CustomersPage', () => {
  it('lists individuals and companies', async () => {
    setup();
    expect(await screen.findByText('Test Customer')).toBeInTheDocument();
    expect(screen.getByText('Dawa Ltd')).toBeInTheDocument();
  });

  it('asks for company details only for corporate customers, and saves the phone without spaces', async () => {
    const { posted } = setup();
    await userEvent.click(await screen.findByRole('button', { name: /New customer/ }));
    const panel = await screen.findByRole('form');
    expect(within(panel).queryByLabelText('Company name')).not.toBeInTheDocument();
    await userEvent.selectOptions(
      within(panel).getByLabelText('Type'),
      'Corporate (company account)',
    );
    expect(within(panel).getByLabelText('Company name')).toBeInTheDocument();

    await userEvent.type(within(panel).getByLabelText('First name'), 'Accounts');
    await userEvent.type(within(panel).getByLabelText('Phone'), '0700 000 202');
    await userEvent.type(within(panel).getByLabelText('Company name'), 'Afya Ltd');
    await userEvent.selectOptions(await within(panel).findByLabelText('Country'), 'Kenya');
    await userEvent.selectOptions(
      await within(panel).findByLabelText('Province or county'),
      'Nairobi',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Create customer' }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      kind: 'corporate',
      firstName: 'Accounts',
      phone: '0700000202',
      organisation: 'Afya Ltd',
      countryId: 1,
      provinceId: 47,
      birthDate: null,
    });
  });
});
