import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, renderRoutes, stubApi } from '@/test/render';

import { HistoryList } from './history-list.jsx';

/**
 * @param {Record<string, unknown>[]} entries
 */
function setup(entries) {
  const api = stubApi({
    'GET sales/bills/7/history': () => jsonResponse(200, { data: entries }),
    'GET app-info': () =>
      jsonResponse(200, {
        data: {
          apiVersion: '1',
          pharmacy: { id: 1, name: 'Demo Pharmacy', city: null, country: null },
          region: { locale: 'en-KE', currency: 'KES', timeZone: 'Africa/Nairobi' },
        },
      }),
  });
  vi.stubGlobal('fetch', api.fetch);
  renderRoutes([{ path: '/', element: <HistoryList path="sales/bills/7/history" /> }]);
}

/**
 * @param {string} action
 * @param {Record<string, unknown>} [details]
 * @param {string} [by]
 */
const entry = (action, details = {}, by = 'Demo Cashier') => ({
  id: action,
  subjectType: 'bill',
  subjectId: '7',
  action,
  by,
  at: '2026-11-06T07:42:00.000Z',
  details,
});

afterEach(() => vi.unstubAllGlobals());

describe('HistoryList', () => {
  it('shows each step with who did it and when', async () => {
    setup([
      entry('sale.made', { code: 'DPSB2611-0457' }),
      entry('labels.printed', { stickers: 3 }),
      entry('receipt.reprinted', {}, 'Demo Pharmacist'),
    ]);
    expect(await screen.findByText('Sold')).toBeInTheDocument();
    expect(screen.getByText('Bill DPSB2611-0457')).toBeInTheDocument();
    expect(screen.getByText('3 stickers')).toBeInTheDocument();
    expect(screen.getByText('Receipt reprinted')).toBeInTheDocument();
    expect(screen.getByText(/Demo Pharmacist/)).toBeInTheDocument();
    expect(screen.getAllByText(/10:42/)).toHaveLength(3);
  });

  it('says when nothing is recorded yet', async () => {
    setup([]);
    expect(await screen.findByText('Nothing recorded yet.')).toBeInTheDocument();
  });
});
