import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { api } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { useFormat } from '@/lib/format';

/** Shortest number worth looking up. */
const MIN_CODE_LENGTH = 6;
const NOT_FOUND = 404;

/**
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').creditNoteLookupSchema>} CreditNoteLookup
 */

/**
 * What a credit note number stands for, as it is typed: whose it is, what is left and until when,
 * or why it cannot pay. Anyone holding the number may spend it; the name is for the cashier to
 * check.
 *
 * @param {{ code: string, onUse: (balance: string) => void }} props
 * @returns {React.JSX.Element | null}
 */
export function CreditNoteCheck({ code, onUse }) {
  const format = useFormat();
  const typed = useDebouncedValue(code.trim().toUpperCase());
  const note = useQuery({
    queryKey: ['sales', 'credit-notes', typed],
    queryFn: async () =>
      /** @type {{ data: CreditNoteLookup }} */ (
        await api.get(`sales/credit-notes/${encodeURIComponent(typed)}`).json()
      ).data,
    enabled: typed.length >= MIN_CODE_LENGTH,
    placeholderData: keepPreviousData,
    retry: false,
  });
  if (typed.length < MIN_CODE_LENGTH) return null;
  if (note.isFetching && !note.data)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Looking up the note…
      </p>
    );
  if (note.error)
    return (
      <p className="text-sm text-destructive" aria-live="polite">
        {isApiError(note.error) && note.error.status === NOT_FOUND
          ? 'No credit note has this number'
          : 'Could not look up the credit note'}
      </p>
    );
  if (!note.data) return null;
  const found = note.data;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm"
      aria-live="polite"
    >
      <span>
        <span className="font-medium">{found.customerName ?? 'No name on the note'}</span>
        {' · '}
        {found.problem ? (
          <span className="text-destructive">{found.problem}</span>
        ) : (
          <>
            {format.money(found.balance)} left
            {found.expiresOn && ` · valid until ${format.date(found.expiresOn)}`}
          </>
        )}
      </span>
      {!found.problem && (
        <Button type="button" variant="outline" size="sm" onClick={() => onUse(found.balance)}>
          Use it
        </Button>
      )}
    </div>
  );
}
