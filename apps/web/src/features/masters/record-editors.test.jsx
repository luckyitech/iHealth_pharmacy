import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CURRENT_USER_KEY } from '@/features/auth/use-auth';
import { confirmChange, jsonResponse, renderRoutes, stubApi } from '@/test/render';

import ManufacturersPage from './manufacturers/manufacturers-page.jsx';
import HospitalsPage from './organisation/hospitals-page.jsx';

const META = { page: 1, pageSize: 25, total: 1, totalPages: 1 };
const HOSPITAL = { id: 5, active: true, name: 'Test Clinic', phone: null, city: 'Nairobi' };
const OTHER_HOSPITAL = { id: 6, active: true, name: 'Other Clinic', phone: null, city: null };
const MANUFACTURER = {
  id: 2,
  active: true,
  name: 'Test Maker',
  city: null,
  license: null,
  phone: null,
};

/**
 * @param {string} path
 */
function setup(path) {
  /** @type {unknown[]} */
  const writes = [];
  const api = stubApi({
    'GET masters/hospitals': () => jsonResponse(200, { data: [HOSPITAL], meta: META }),
    'GET masters/hospitals/6': () => jsonResponse(200, { data: OTHER_HOSPITAL }),
    'PATCH masters/hospitals/5': async (request) => {
      const body = await request.json();
      writes.push(body);
      return jsonResponse(200, { data: { ...HOSPITAL, ...body } });
    },
    'GET masters/manufacturers': () => jsonResponse(200, { data: [MANUFACTURER], meta: META }),
    'DELETE masters/manufacturers/2': () => {
      writes.push('deactivate');
      return new Response(null, { status: 204 });
    },
    'POST masters/manufacturers/2/restore': () => {
      writes.push('restore');
      return jsonResponse(200, { data: MANUFACTURER });
    },
    'GET lookups/countries': () => jsonResponse(200, { data: [] }),
  });
  vi.stubGlobal('fetch', api.fetch);
  const view = renderRoutes(
    [
      { path: '/masters/hospitals', element: <HospitalsPage /> },
      { path: '/masters/manufacturers', element: <ManufacturersPage /> },
    ],
    path,
  );
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

describe('large record dialog', () => {
  it('opens over the list, keeps the list search in the URL, and closes back to it', async () => {
    const { router } = setup('/masters/hospitals?q=test');
    await userEvent.click(await screen.findByText('Test Clinic'));
    const dialog = await screen.findByRole('dialog', { name: 'Test Clinic' });
    expect(router.state.location.search).toBe('?q=test&edit=5');
    expect(within(dialog).getByRole('navigation', { name: 'Sections' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(router.state.location.search).toBe('?q=test'));
  });

  it('opens a record from a link even when it is not on the current page of the list', async () => {
    setup('/masters/hospitals?edit=6');
    expect(await screen.findByRole('dialog', { name: 'Other Clinic' })).toBeInTheDocument();
  });

  it('asks before closing with unsaved changes, and saves with Ctrl+S', async () => {
    const { writes, router } = setup('/masters/hospitals?edit=5');
    const dialog = await screen.findByRole('dialog', { name: 'Test Clinic' });
    await userEvent.type(within(dialog).getByLabelText('Phone'), '0700000505');
    expect(within(dialog).getByText('Unsaved changes')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    const discard = await screen.findByRole('dialog', { name: 'Discard your changes?' });
    await userEvent.click(within(discard).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'Test Clinic' })).toBeInTheDocument();

    await userEvent.keyboard('{Control>}s{/Control}');

    await confirmChange();
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ phone: '0700000505' });
    expect(await screen.findByText('Hospital "Test Clinic" saved')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });
});

describe('saving asks first', () => {
  it('lists what changed, keeps Save off until something changes, and Enter goes back', async () => {
    const { writes } = setup('/masters/hospitals?edit=5');
    const dialog = await screen.findByRole('dialog', { name: 'Test Clinic' });
    const save = within(dialog).getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText('Phone'), '0700000505');
    expect(save).toBeEnabled();
    await userEvent.click(save);
    const question = await screen.findByRole('alertdialog', { name: 'Save these changes?' });
    const changes = within(question).getByRole('list', { name: 'Changes' });
    expect(within(changes).getByText('Phone')).toBeInTheDocument();
    expect(within(changes).getByText('(empty)')).toBeInTheDocument();
    expect(within(changes).getByText('0700000505')).toBeInTheDocument();

    expect(within(question).getByRole('button', { name: 'Go back' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(writes).toHaveLength(0);
    expect(screen.getByRole('dialog', { name: 'Test Clinic' })).toBeInTheDocument();
  });
});

describe('small record dialog', () => {
  it('keeps Deactivate out of the footer and asks before discarding changes', async () => {
    setup('/masters/manufacturers');
    await userEvent.click(await screen.findByText('Test Maker'));
    const dialog = await screen.findByRole('dialog', { name: 'Test Maker' });
    expect(within(dialog).getByText('Active')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Deactivate/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Website'), 'example.test');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    const discard = await screen.findByRole('dialog', { name: 'Discard your changes?' });
    await userEvent.click(within(discard).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Test Maker' })).not.toBeInTheDocument(),
    );
  });
});

describe('notifications', () => {
  it('offers Undo after a deactivation, which restores the record', async () => {
    const { writes } = setup('/masters/manufacturers?edit=2');
    const dialog = await screen.findByRole('dialog', { name: 'Test Maker' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Deactivate manufacturer' }));
    const question = await screen.findByRole('dialog', { name: 'Deactivate Test Maker?' });
    await userEvent.click(within(question).getByRole('button', { name: 'Deactivate' }));

    expect(await screen.findByText('"Test Maker" deactivated')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(writes).toEqual(['deactivate', 'restore']));
  });
});
