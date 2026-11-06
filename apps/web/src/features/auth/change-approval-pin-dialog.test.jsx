import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, renderRoutes, stubApi } from '@/test/render';

import { ChangeApprovalPinDialog } from './change-approval-pin-dialog.jsx';

/**
 * @param {(request: Request) => Promise<Response> | Response} answer
 */
function setup(answer) {
  /** @type {unknown[]} */
  const sent = [];
  const onClose = vi.fn();
  const api = stubApi({
    'PUT auth/approval-pin': async (/** @type {Request} */ request) => {
      sent.push(await request.clone().json());
      return answer(request);
    },
  });
  vi.stubGlobal('fetch', api.fetch);
  renderRoutes([{ path: '/', element: <ChangeApprovalPinDialog open onClose={onClose} /> }], '/');
  return { sent, onClose };
}

/**
 * @param {{ current: string, next: string, confirm?: string }} pins
 */
async function fill({ current, next, confirm = next }) {
  await userEvent.type(await screen.findByLabelText(/^Current PIN/), current);
  await userEvent.type(screen.getByLabelText(/^New PIN/), next);
  await userEvent.type(screen.getByLabelText(/^Confirm new PIN/), confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Change PIN' }));
}

afterEach(() => vi.unstubAllGlobals());

describe('ChangeApprovalPinDialog', () => {
  it('sends the current and the new PIN, then closes', async () => {
    const { sent, onClose } = setup(() => new Response(null, { status: 204 }));
    await fill({ current: '482913', next: '735102' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sent).toEqual([{ currentPin: '482913', newPin: '735102' }]);
  });

  it('puts a wrong current PIN on its field', async () => {
    const { onClose } = setup(() =>
      jsonResponse(400, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid input',
          details: [{ path: 'body.currentPin', message: 'This is not your current approval PIN' }],
        },
      }),
    );
    await fill({ current: '999999', next: '735102' });
    expect(await screen.findByText('This is not your current approval PIN')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('checks the new PIN before sending it', async () => {
    const { sent } = setup(() => new Response(null, { status: 204 }));
    await fill({ current: '482913', next: '735102', confirm: '735100' });
    expect(await screen.findByText('The PINs do not match')).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });
});
