import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, renderRoutes, stubApi } from '@/test/render';

import { SalesSettingsCard } from './sales-settings-card.jsx';

/**
 * @param {{ canWrite?: boolean }} [options]
 */
function setup({ canWrite = true } = {}) {
  /** @type {unknown[]} */
  const saved = [];
  const api = stubApi({
    'GET masters/sales-settings': () => jsonResponse(200, { data: { controlledDrugRules: true } }),
    'PUT masters/sales-settings': async (request) => {
      const body = await request.json();
      saved.push(body);
      return jsonResponse(200, { data: body });
    },
  });
  vi.stubGlobal('fetch', api.fetch);
  renderRoutes([{ path: '/', element: <SalesSettingsCard canWrite={canWrite} /> }], '/');
  return { saved };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sales settings', () => {
  it('turns the controlled-drug rules off after asking first', async () => {
    const { saved } = setup();
    const rules = await screen.findByRole('checkbox', { name: 'Controlled-drug rules' });
    expect(rules).toBeChecked();
    expect(screen.getByRole('button', { name: 'Save sales settings' })).toBeDisabled();
    await userEvent.click(rules);
    expect(screen.getByText(/Off: as in the old system/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save sales settings' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Controlled-drug rules');
    expect(confirm).toHaveTextContent('On');
    expect(confirm).toHaveTextContent('Off');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(saved).toEqual([{ controlledDrugRules: false }]));
    expect(await screen.findByText('Sales settings saved')).toBeInTheDocument();
  });

  it('shows the setting read-only to people who cannot change it', async () => {
    setup({ canWrite: false });
    expect(await screen.findByRole('checkbox', { name: 'Controlled-drug rules' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save sales settings' })).not.toBeInTheDocument();
  });
});
