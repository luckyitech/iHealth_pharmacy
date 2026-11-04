import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, recordPageRoutes, renderRoutes, stubApi } from '@/test/render';
import { CURRENT_USER_KEY } from '@/features/auth/use-auth';

import EmployeesPage, { EditorPage } from './employees-page.jsx';

const EMPLOYEE = {
  id: 9,
  active: true,
  code: 'DPEM0101260001',
  title: 'Ms',
  firstName: 'Test',
  middleName: null,
  lastName: 'Employee',
  gender: 'F',
  designation: 'Pharmacist',
  phone: '0700000303',
  employeeTypeId: 4,
  employeeTypeName: 'PHARMACIST',
  worksShifts: false,
};

function setup() {
  /** @type {Record<string, unknown>[]} */
  const posted = [];
  const api = stubApi({
    'GET masters/employees/9': () => jsonResponse(200, { data: EMPLOYEE }),
    'GET masters/employees': () =>
      jsonResponse(200, {
        data: [EMPLOYEE],
        meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
      }),
    'GET lookups/employee-types': () =>
      jsonResponse(200, { data: [{ id: 4, name: 'PHARMACIST' }] }),
    'GET lookups/countries': () => jsonResponse(200, { data: [{ id: 1, name: 'Kenya' }] }),
    'GET lookups/provinces': () => jsonResponse(200, { data: [{ id: 47, name: 'Nairobi' }] }),
    'POST masters/employees': async (request) => {
      const body = await request.json();
      posted.push(body);
      return jsonResponse(201, { data: { ...EMPLOYEE, ...body, id: 10 } });
    },
  });
  vi.stubGlobal('fetch', api.fetch);
  const view = renderRoutes(
    recordPageRoutes('/masters/employees', <EmployeesPage />, <EditorPage />),
    '/masters/employees',
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

describe('EmployeesPage', () => {
  it('shows the generated code of an existing employee, not as an editable field', async () => {
    setup();
    await userEvent.click(await screen.findByText('Test Employee'));
    const panel = await screen.findByRole('form');
    expect(screen.getByText('DPEM0101260001')).toBeInTheDocument();
    expect(
      within(panel).queryByRole('textbox', { name: /employee code/i }),
    ).not.toBeInTheDocument();
  });

  it('creates an employee with the dates and the shift flag', async () => {
    const { posted } = setup();
    await userEvent.click(await screen.findByRole('button', { name: /New employee/ }));
    const panel = await screen.findByRole('form');
    await userEvent.selectOptions(within(panel).getByLabelText('Title'), 'Ms');
    await userEvent.type(within(panel).getByLabelText('First name'), 'New');
    await userEvent.type(within(panel).getByLabelText('Last name'), 'Hire');
    await userEvent.selectOptions(within(panel).getByLabelText('Gender'), 'Female');
    await userEvent.type(within(panel).getByLabelText('Date of birth'), '1998-02-14');
    await userEvent.type(within(panel).getByLabelText('Mobile phone'), '0700 000 404');
    await userEvent.type(within(panel).getByLabelText('Designation'), 'Cashier');
    await userEvent.selectOptions(
      await within(panel).findByLabelText('Employee type'),
      'PHARMACIST',
    );
    await userEvent.type(within(panel).getByLabelText('Date of joining'), '2026-01-05');
    await userEvent.click(within(panel).getByLabelText('Works shifts'));
    await userEvent.type(within(panel).getByLabelText('NSSF number'), 'NSSF-NEW-1');
    await userEvent.type(within(panel).getByLabelText('Postal code'), '00100');
    await userEvent.selectOptions(await within(panel).findByLabelText('Country'), 'Kenya');
    await userEvent.selectOptions(
      await within(panel).findByLabelText('Province or county'),
      'Nairobi',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Create employee' }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      title: 'Ms',
      gender: 'F',
      birthDate: '1998-02-14',
      joiningDate: '2026-01-05',
      phone: '0700000404',
      employeeTypeId: 4,
      worksShifts: true,
      employment: null,
    });
  });
});
