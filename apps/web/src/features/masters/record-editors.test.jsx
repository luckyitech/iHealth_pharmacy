import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CURRENT_USER_KEY } from '@/features/auth/use-auth';
import { jsonResponse, recordPageRoutes, renderRoutes, stubApi } from '@/test/render';

import ManufacturersPage from './manufacturers/manufacturers-page.jsx';
import HospitalsPage, { EditorPage as HospitalEditorPage } from './organisation/hospitals-page.jsx';

const META = { page: 1, pageSize: 25, total: 1, totalPages: 1 };
const HOSPITAL = { id: 5, active: true, name: 'Test Clinic', phone: null, city: 'Nairobi' };
const MANUFACTURER = {
  id: 2,
  active: true,
  name: 'Test Maker',
  city: null,
  license: null,
  phone: null,
};

/**
 * @param {import('react-router').RouteObject[]} routes
 * @param {string} path
 */
function setup(routes, path) {
  /** @type {{ method: string, body: unknown }[]} */
  const writes = [];
  const record = async (/** @type {Request} */ request) => {
    const body = await request.json();
    writes.push({ method: request.method, body });
    return jsonResponse(200, { data: { ...HOSPITAL, ...MANUFACTURER, ...body } });
  };
  const api = stubApi({
    'GET masters/hospitals': () => jsonResponse(200, { data: [HOSPITAL], meta: META }),
    'GET masters/hospitals/5': () => jsonResponse(200, { data: HOSPITAL }),
    'PATCH masters/hospitals/5': record,
    'GET masters/manufacturers': () => jsonResponse(200, { data: [MANUFACTURER], meta: META }),
    'PATCH masters/manufacturers/2': record,
    'GET lookups/countries': () => jsonResponse(200, { data: [] }),
  });
  vi.stubGlobal('fetch', api.fetch);
  const view = renderRoutes(routes, path);
  view.queryClient.setQueryData(CURRENT_USER_KEY, {
    employeeId: 1,
    firstName: 'A',
    lastName: 'B',
    roles: [],
    permissionIds: [1],
  });
  return { ...view, writes };
}

afterEach(() => vi.unstubAllGlobals());

const hospitalRoutes = () =>
  recordPageRoutes('/masters/hospitals', <HospitalsPage />, <HospitalEditorPage />);

describe('record edit page', () => {
  it('opens on its own page and returns to the same list search', async () => {
    const { router } = setup(hospitalRoutes(), '/masters/hospitals?q=test');
    await userEvent.click(await screen.findByText('Test Clinic'));
    expect(await screen.findByRole('form', { name: 'Test Clinic' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/masters/hospitals/5/edit');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(router.state.location.search).toBe('?q=test'));
    expect(router.state.location.pathname).toBe('/masters/hospitals');
  });

  it('asks before leaving with unsaved changes, and saves with Ctrl+S', async () => {
    const { router, writes } = setup(hospitalRoutes(), '/masters/hospitals/5/edit');
    const form = await screen.findByRole('form', { name: 'Test Clinic' });
    await userEvent.type(within(form).getByLabelText('Phone'), '0700000505');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Hospitals' }));
    const leave = await screen.findByRole('dialog', { name: 'Leave without saving?' });
    await userEvent.click(within(leave).getByRole('button', { name: 'Cancel' }));
    expect(router.state.location.pathname).toBe('/masters/hospitals/5/edit');

    await userEvent.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].body).toMatchObject({ phone: '0700000505' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/masters/hospitals'));
  });
});

describe('record dialog', () => {
  it('edits a small record in a dialog and asks before discarding changes', async () => {
    setup(
      [{ path: '/masters/manufacturers', element: <ManufacturersPage /> }],
      '/masters/manufacturers',
    );
    await userEvent.click(await screen.findByText('Test Maker'));
    const dialog = await screen.findByRole('dialog', { name: 'Test Maker' });
    expect(within(dialog).getByText('Active')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Deactivate/ })).not.toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Website'), 'example.test');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    const discard = await screen.findByRole('dialog', { name: 'Discard your changes?' });
    await userEvent.click(within(discard).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Test Maker' })).not.toBeInTheDocument(),
    );
  });
});
