import { useQueryClient } from '@tanstack/react-query';
import { Loader2, ScanBarcode } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';

import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useFormat } from '@/lib/format';
import { notify } from '@/lib/notify';
import { noAutofill } from '@/lib/autofill';
import { cn } from '@/lib/utils';

import { batchSearchKey, fetchBatches, useBatchSearch } from './till-api.js';
import { parseEntry } from './till-state.js';

/** Searches wait this long after the last key; a scanner types far faster. */
const SEARCH_DELAY_MS = 150;

/**
 * @typedef {import('./till-api.js').SellableBatch} SellableBatch
 */

/**
 * @param {SellableBatch[]} batches
 * @param {number} from
 * @param {1 | -1} step
 * @returns {number} The next batch that can be sold, or `from` when there is none.
 */
function nextSellable(batches, from, step) {
  for (let index = from + step; index >= 0 && index < batches.length; index += step) {
    if (!batches[index].expired) return index;
  }
  return from;
}

/**
 * @param {SellableBatch[]} batches
 * @returns {number} The first batch that can be sold, or -1.
 */
const firstSellable = (batches) => batches.findIndex((batch) => !batch.expired);

/**
 * The till's search box: scan a barcode or type a name, then Enter. `3*` before the search sells
 * three. The first batch to expire is chosen; expired batches are shown but cannot be chosen.
 * With the box empty, other keys go to `onIdleKey` (to change the selected line).
 *
 * @param {object} props
 * @param {(batch: SellableBatch, quantity: number) => void} props.onAdd
 * @param {(event: React.KeyboardEvent<HTMLInputElement>) => void} props.onIdleKey
 * @param {React.Ref<HTMLInputElement>} props.inputRef
 * @returns {React.JSX.Element}
 */
export function ItemSearch({ onAdd, onIdleKey, inputRef }) {
  const format = useFormat();
  const queryClient = useQueryClient();
  const listId = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const { quantity, query } = parseEntry(text);
  const debounced = useDebouncedValue(query, SEARCH_DELAY_MS);
  const search = useBatchSearch(debounced);
  const current = search.data && !search.isPlaceholderData ? search.data : undefined;
  const batches = useMemo(() => (query ? (search.data?.batches ?? []) : []), [query, search.data]);
  const [activeId, setActiveId] = useState(/** @type {number | null} */ (null));
  // The highlighted batch follows the results: the first one to sell until the cashier moves.
  const chosenIndex = batches.findIndex((batch) => batch.stockId === activeId);
  const active = chosenIndex >= 0 ? chosenIndex : firstSellable(batches);

  /**
   * @param {1 | -1} step
   * @returns {void}
   */
  const move = (step) => setActiveId(batches[nextSellable(batches, active, step)]?.stockId ?? null);
  useEffect(() => {
    if (search.error)
      notify.failure('Could not search the stock', search.error, { id: 'till-search' });
  }, [search.error]);

  /**
   * @param {SellableBatch} batch
   * @returns {void}
   */
  const add = (batch) => {
    onAdd(batch, quantity);
    setText('');
    setOpen(false);
  };

  /** Enter before the results arrived (a scanner is that fast): wait for them, then decide. */
  const addFromEnter = async () => {
    if (!query) return;
    if (current && debounced === query) {
      const chosen = current.scanned ? batches[firstSellable(batches)] : batches[active];
      if (chosen && !chosen.expired) add(chosen);
      else if (batches.length) notify.info('Every batch of this item has expired');
      return;
    }
    try {
      const result = await queryClient.fetchQuery({
        queryKey: batchSearchKey(query),
        queryFn: () => fetchBatches(query),
      });
      const first = result.batches[firstSellable(result.batches)];
      if (result.scanned && first) add(first);
      else if (!result.batches.length) notify.info(`Nothing in stock matches "${query}"`);
      else setOpen(true);
    } catch (error) {
      notify.failure('Could not search the stock', error, { id: 'till-search' });
    }
  };

  /**
   * @param {React.KeyboardEvent<HTMLInputElement>} event
   * @returns {void}
   */
  const onKeyDown = (event) => {
    const listShown = open && batches.length > 0;
    if (event.key === 'Enter') {
      event.preventDefault();
      void addFromEnter();
    } else if (event.key === 'ArrowDown' && listShown) {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp' && listShown) {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Escape' && text) {
      // Clears the search only; the page's Escape (clear the sale) waits for an empty box.
      event.preventDefault();
      event.stopPropagation();
      setText('');
      setOpen(false);
    } else if (!text) {
      onIdleKey(event);
    }
  };

  const shown = open && query.length > 0;
  const loading = search.isFetching && debounced === query;
  /** The first batch of each item to expire is the one to take. */
  const firstOfItem = new Set(
    batches
      .filter(
        (batch, index) =>
          !batch.expired &&
          batches.findIndex((b) => b.itemId === batch.itemId && !b.expired) === index,
      )
      .map((batch) => batch.stockId),
  );

  return (
    <div className="relative">
      <div className="flex h-12 items-center gap-3 rounded-lg border-2 border-primary bg-background px-3 focus-within:ring-[3px] focus-within:ring-ring/40">
        {loading ? (
          <Loader2 aria-hidden="true" className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <ScanBarcode aria-hidden="true" className="size-5 text-muted-foreground" />
        )}
        <input
          {...noAutofill('text')}
          ref={inputRef}
          role="combobox"
          aria-label="Find an item"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
          spellCheck={false}
          placeholder="Scan a barcode or type a name"
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {quantity > 1 && (
          <span className="rounded bg-accent px-2 py-0.5 text-sm font-medium text-accent-foreground tabular-nums">
            × {quantity}
          </span>
        )}
      </div>

      {shown && (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-lg border bg-popover shadow-lg">
          <ul
            id={listId}
            role="listbox"
            aria-label="Batches in stock"
            className="max-h-96 overflow-y-auto"
          >
            {batches.map((batch, index) => (
              // Keyboard choice happens in the search box (aria-activedescendant); clicks are for mice and touch.
              // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events
              <li
                key={batch.stockId}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                aria-disabled={batch.expired || undefined}
                className={cn(
                  'grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 border-b px-4 py-2.5 last:border-b-0 sm:grid-cols-[1fr_auto_auto]',
                  index === active && 'bg-accent',
                  batch.expired && 'cursor-not-allowed opacity-60',
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => !batch.expired && setActiveId(batch.stockId)}
                onClick={() => !batch.expired && add(batch)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {batch.itemName ?? batch.itemCode ?? '—'}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Batch {batch.batchNo ?? '—'}
                    {batch.expiryDate &&
                      ` · ${batch.expired ? 'expired' : 'expires'} ${format.date(batch.expiryDate)}`}
                    {firstOfItem.has(batch.stockId) && ' · first to expire'}
                  </span>
                </span>
                <span
                  className={cn(
                    'text-sm max-sm:col-start-1 max-sm:row-start-3',
                    batch.expired ? 'font-semibold text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {batch.expired ? "Expired · can't sell" : `${batch.available} in stock`}
                </span>
                <span className="text-right font-semibold tabular-nums max-sm:row-span-2 max-sm:row-start-1 max-sm:col-start-2">
                  {format.money(batch.labelPrice)}
                </span>
              </li>
            ))}
          </ul>
          {!batches.length && !loading && current && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Nothing in stock matches “{query}”.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
