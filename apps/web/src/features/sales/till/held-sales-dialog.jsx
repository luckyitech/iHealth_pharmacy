import { Loader2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useFormat } from '@/lib/format';

/**
 * @typedef {import('./till-api.js').HeldSaleSummary} HeldSaleSummary
 */

/**
 * One held sale: who it is for, when, and its total when held, with Recall and Discard.
 *
 * @param {object} props
 * @param {HeldSaleSummary} props.sale
 * @param {(sale: HeldSaleSummary) => void} props.onRecall
 * @param {(sale: HeldSaleSummary) => void} [props.onDiscard]
 * @param {boolean} [props.busy]
 * @returns {React.JSX.Element}
 */
export function HeldSaleRow({ sale, onRecall, onDiscard, busy }) {
  const format = useFormat();
  const name = sale.customerName ?? 'Walk-in';
  return (
    <li className="flex items-center gap-2 border-t py-2 first:border-t-0">
      <button
        type="button"
        disabled={busy}
        className="grid min-w-0 flex-1 rounded-md px-1 py-0.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-50"
        aria-label={`Recall the sale for ${name}, ${sale.lineCount} items, ${format.money(sale.net)}`}
        onClick={() => onRecall(sale)}
      >
        <span className="flex justify-between gap-3">
          <span className="truncate font-medium">
            {name} · {sale.lineCount} {sale.lineCount === 1 ? 'item' : 'items'}
          </span>
          <span className="tabular-nums">{format.money(sale.net)}</span>
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {format.time(sale.heldAt)}
          {sale.heldBy && ` · ${sale.heldBy}`}
          {sale.note && ` · ${sale.note}`}
        </span>
      </button>
      {onDiscard && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-destructive"
          disabled={busy}
          aria-label={`Discard the held sale for ${name}`}
          onClick={() => onDiscard(sale)}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}

/**
 * Every sale on hold in the pharmacy, newest first. Recalling puts it back on this till.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {HeldSaleSummary[] | undefined} props.sales
 * @param {boolean} props.loading
 * @param {boolean} props.busy
 * @param {(sale: HeldSaleSummary) => void} props.onRecall
 * @param {(sale: HeldSaleSummary) => void} props.onDiscard
 * @returns {React.JSX.Element}
 */
export function HeldSalesDialog({ open, onOpenChange, sales, loading, busy, onRecall, onDiscard }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Held sales"
        description="Choose a sale to finish it on this till."
        className="max-w-lg"
      >
        {loading && !sales ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Loading…
          </p>
        ) : sales?.length ? (
          <ul className="max-h-96 overflow-y-auto">
            {sales.map((sale) => (
              <HeldSaleRow
                key={sale.id}
                sale={sale}
                busy={busy}
                onRecall={onRecall}
                onDiscard={onDiscard}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No sales are on hold.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
