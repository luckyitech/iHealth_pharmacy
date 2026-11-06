import { LINE_WARNINGS, MAX_LINE_QUANTITY } from '@ihealth/shared/schemas';
import { Minus, Percent, Plus, ScanBarcode, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useFormat } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SALES_LABELS } from '../labels.js';

/**
 * @typedef {import('./till-state.js').TillLine} TillLine
 * @typedef {import('./till-api.js').SaleQuote['lines'][number]} QuoteLine
 */

/**
 * The lines of the sale. Names, prices and amounts come from the server's quote; until it answers,
 * what the search showed is used and amounts read "…".
 *
 * @param {object} props
 * @param {TillLine[]} props.lines
 * @param {(index: number) => QuoteLine | undefined} props.quoteOf
 * @param {number} props.selected
 * @param {React.Dispatch<import('./till-state.js').TillAction>} props.dispatch
 * @param {(index: number) => void} props.onDiscount
 * @returns {React.JSX.Element}
 */
export function SaleLines({ lines, quoteOf, selected, dispatch, onDiscount }) {
  const format = useFormat();

  if (!lines.length) {
    return (
      <div className="grid place-items-center gap-2 rounded-lg border border-dashed px-6 py-14 text-center text-muted-foreground">
        <ScanBarcode aria-hidden="true" className="size-8" />
        <p className="font-medium text-foreground">No items yet</p>
        <p className="text-sm">Scan a barcode or search for an item to start the sale.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <caption className="sr-only">Items on this sale</caption>
        <thead className="text-xs text-muted-foreground uppercase">
          <tr className="border-b">
            <th scope="col" className="hidden w-8 px-3 py-2.5 text-left font-medium sm:table-cell">
              #
            </th>
            <th scope="col" className="px-2 py-2.5 text-left font-medium sm:px-3">
              Item
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              {SALES_LABELS.QTY}
            </th>
            <th scope="col" className="hidden px-3 py-2.5 text-right font-medium md:table-cell">
              {SALES_LABELS.PRICE_WITH_VAT}
            </th>
            <th scope="col" className="hidden px-3 py-2.5 text-right font-medium md:table-cell">
              {SALES_LABELS.SALE_DISCOUNT}
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              {SALES_LABELS.TOTAL_AMOUNT}
            </th>
            <th scope="col" className="w-10 px-2 py-2.5">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const quote = quoteOf(index);
            const name = quote?.itemName ?? line.itemName ?? '—';
            const batchNo = quote?.batchNo ?? line.batchNo;
            const expiry = quote?.expiryDate ?? line.expiryDate;
            const warnings = quote?.warnings ?? [];
            const isSelected = index === selected;
            return (
              <tr
                key={line.stockId}
                aria-selected={isSelected}
                className={cn(
                  'border-b last:border-b-0',
                  isSelected && 'bg-accent shadow-[inset_3px_0_0_var(--primary)]',
                )}
                onClick={() => dispatch({ type: 'select', index })}
              >
                <td className="hidden px-3 py-2.5 text-muted-foreground tabular-nums sm:table-cell">
                  {index + 1}
                </td>
                <td className="px-2 py-2.5 sm:px-3">
                  <span className="block font-medium">{name}</span>
                  <span className="block text-xs text-muted-foreground">
                    Batch {batchNo ?? '—'}
                    {expiry && ` · ${format.date(expiry)}`}
                    {warnings.includes(LINE_WARNINGS.INSUFFICIENT_STOCK) && (
                      <span className="font-medium text-destructive">
                        {' '}
                        · only {quote?.available ?? 0} in stock
                      </span>
                    )}
                    {warnings.includes(LINE_WARNINGS.EXPIRED) && (
                      <span className="font-medium text-destructive"> · expired, remove it</span>
                    )}
                  </span>
                </td>
                <td className="px-1 py-2.5 text-right sm:px-3">
                  <span className="inline-flex items-center overflow-hidden rounded-md border bg-background">
                    <button
                      type="button"
                      aria-label={`One fewer ${name}`}
                      className="grid size-7 place-items-center hover:bg-accent disabled:opacity-40 sm:size-8"
                      disabled={line.quantity <= 1}
                      onClick={() => dispatch({ type: 'step', index, delta: -1 })}
                    >
                      <Minus aria-hidden="true" className="size-3.5" />
                    </button>
                    <input
                      aria-label={`Quantity of ${name}`}
                      inputMode="numeric"
                      className="h-7 w-10 border-x sm:h-8 sm:w-12 bg-transparent text-center font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      value={line.quantity}
                      onFocus={() => dispatch({ type: 'select', index })}
                      onChange={(event) => {
                        const quantity = Number(event.target.value.replace(/\D/g, ''));
                        if (quantity >= 1 && quantity <= MAX_LINE_QUANTITY)
                          dispatch({ type: 'setQuantity', index, quantity });
                      }}
                    />
                    <button
                      type="button"
                      aria-label={`One more ${name}`}
                      className="grid size-7 place-items-center hover:bg-accent sm:size-8"
                      onClick={() => dispatch({ type: 'step', index, delta: 1 })}
                    >
                      <Plus aria-hidden="true" className="size-3.5" />
                    </button>
                  </span>
                </td>
                <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">
                  {quote ? format.money(quote.labelPrice) : '…'}
                </td>
                <td className="hidden px-3 py-2.5 text-right md:table-cell">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="tabular-nums"
                    aria-label={`Discount on ${name}: ${line.discountPercent}%`}
                    onClick={(event) => {
                      event.stopPropagation();
                      dispatch({ type: 'select', index });
                      onDiscount(index);
                    }}
                  >
                    {line.discountPercent ? (
                      line.discountPercent
                    ) : (
                      <Percent aria-hidden="true" className="text-muted-foreground" />
                    )}
                  </Button>
                </td>
                <td className="px-2 py-2.5 text-right font-medium whitespace-nowrap tabular-nums sm:px-3">
                  {quote ? format.money(quote.amount) : '…'}
                </td>
                <td className="px-1 py-2.5 sm:px-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      dispatch({ type: 'remove', index });
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
