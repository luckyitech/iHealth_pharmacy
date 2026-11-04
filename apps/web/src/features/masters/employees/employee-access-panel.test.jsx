import { PERMISSIONS } from '@ihealth/shared/permissions';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CURRENT_USER_KEY } from '@/features/auth/use-auth';
import { jsonResponse, renderRoutes, stubApi } from '@/test/render';

import { EmployeeAccessPanel } from './employee-access-panel.jsx';

/** @type {import('./access-api.js').EmployeeAccess} */
const ACCESS = {
  employeeId: 9,
  hasLogin: true,
  username: 'test.employee',
  loginEnabled: true,
  lockedUntil: null,
  twoFactorEnabled: false,
  mustChangePassword: false,
  roleId: 4,
  roleName: 'PHARMACIST',
  permissionIds: [],
  rolePermissionIds: [PERMISSIONS.MASTER_MASTERS_ENTRY.id],
};

/**
 * @param {{ access?: Partial<typeof ACCESS>, signedInAs?: number }} [options]
 */
function setup({ access = {}, signedInAs = 1 } = {}) {
  /** @type {{ path: string, body: unknown }[]} */
  const writes = [];
  /** @param {string} path */
  const write = (path) => async (/** @type {Request} */ request) => {
    const body = await request.json();
    writes.push({ path, body });
    return jsonResponse(200, { data: { ...ACCESS, ...access, ...body } });
  };
  const api = stubApi({
    'GET masters/employees/9/access': () => jsonResponse(200, { data: { ...ACCESS, ...access } }),
    'GET lookups/roles': () => jsonResponse(200, { data: [{ id: 4, name: 'PHARMACIST' }] }),
    'PUT masters/employees/9/access/password': write('password'),
    'PUT masters/employees/9/access/permissions': write('permissions'),
    'POST masters/employees/9/access/unlock': write('unlock'),
  });
  vi.stubGlobal('fetch', api.fetch);
  const view = renderRoutes(
    [{ path: '/', element: <EmployeeAccessPanel item={{ id: 9 }} canWrite /> }],
    '/',
  );
  view.queryClient.setQueryData(CURRENT_USER_KEY, {
    employeeId: signedInAs,
    firstName: 'A',
    lastName: 'B',
    roles: [],
    permissionIds: [1],
  });
  return { ...view, writes };
}

afterEach(() => vi.unstubAllGlobals());

describe('EmployeeAccessPanel', () => {
  it('sets a temporary password that must be changed at the next sign-in', async () => {
    const { writes } = setup();
    await userEvent.type(await screen.findByLabelText('New password'), 'Temporary-Pass-1');
    await userEvent.type(screen.getAllByLabelText('Confirm password')[0], 'Temporary-Pass-1');
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      path: 'password',
      body: { password: 'Temporary-Pass-1', mustChangePassword: true },
    });
  });

  it('shows permissions from the role as fixed, and saves the individual ones', async () => {
    const { writes } = setup();
    const fromRole = await screen.findByRole('checkbox', { name: 'Masters Entry' });
    expect(fromRole).toBeChecked();
    expect(fromRole).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Masters View' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save permissions' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].body).toEqual({ permissionIds: [PERMISSIONS.MASTER_MASTERS_VIEW.id] });
  });

  it('offers to unlock an account locked after wrong passwords', async () => {
    const { writes } = setup({ access: { lockedUntil: '2026-11-04T12:00:00.000Z' } });
    await userEvent.click(await screen.findByRole('button', { name: 'Unlock now' }));
    await waitFor(() => expect(writes.map((write) => write.path)).toEqual(['unlock']));
  });

  it('does not let administrators change their own access', async () => {
    setup({ signedInAs: 9 });
    expect(await screen.findByText(/This is your own account/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set password' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save permissions' })).not.toBeInTheDocument();
  });
});
