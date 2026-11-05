import { useCallback, useState } from 'react';

import { SaveConfirmDialog } from '@/components/feedback/save-confirm-dialog';

/**
 * `ask(request)` shows a confirmation; render `dialog` once in the component.
 *
 * @returns {{ ask: (request: import('@/components/feedback/save-confirm-dialog').ConfirmRequest) => void, dialog: React.JSX.Element }}
 */
export function useConfirm() {
  const [request, setRequest] = useState(
    /** @type {import('@/components/feedback/save-confirm-dialog').ConfirmRequest | null} */ (null),
  );
  const ask = useCallback(
    (/** @type {import('@/components/feedback/save-confirm-dialog').ConfirmRequest} */ next) =>
      setRequest(next),
    [],
  );
  return {
    ask,
    dialog: <SaveConfirmDialog request={request} onClose={() => setRequest(null)} />,
  };
}
