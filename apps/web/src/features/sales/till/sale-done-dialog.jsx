import { Check, Printer, Tag } from 'lucide-react';
import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useFormat } from '@/lib/format';

import { METHOD_LABELS } from '../history/bill-labels.js';
import { TILL_KEYS } from './till-keys.js';

/**
 * The sale is saved: the bill number and, large, the change to give. P prints the receipt, L the
 * dosing labels; Enter (the focused button) starts the next sale.
 *
 * @param {object} props
 * @param {import('./till-api.js').CompletedSale | null} props.sale
 * @param {() => void} props.onPrint
 * @param {() => void} props.onLabels
 * @param {() => void} props.onNext
 * @param {React.RefObject<HTMLElement | null>} props.returnFocusTo Where the cashier carries on (the search).
 * @returns {React.JSX.Element}
 */
export function SaleDoneDialog({ sale, onPrint, onLabels, onNext, returnFocusTo }) {
  const format = useFormat();
  const next = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const paid = (sale?.payments ?? [])
    .map(
      (payment) =>
        `${format.money(payment.amount)} ${METHOD_LABELS[/** @type {keyof typeof METHOD_LABELS} */ (payment.method)]}`,
    )
    .join(' + ');
  return (
    <Dialog open={sale !== null} onOpenChange={(open) => !open && onNext()}>
      <DialogContent
        title="Sale complete"
        description={sale?.code ?? ''}
        hideClose
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          next.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusTo.current?.focus();
        }}
        className="text-center [&>div:first-child]:justify-items-center [&>div:first-child]:pr-0"
        onKeyDown={(event) => {
          if (event.ctrlKey || event.metaKey) return;
          const key = event.key.toLowerCase();
          if (key === TILL_KEYS.PRINT || key === TILL_KEYS.LABELS) {
            event.preventDefault();
            if (key === TILL_KEYS.PRINT) onPrint();
            else onLabels();
          }
        }}
      >
        <div className="grid justify-items-center gap-2">
          <span className="grid size-14 place-items-center rounded-full bg-success/15 text-success">
            <Check aria-hidden="true" className="size-8" />
          </span>
          <p className="text-4xl font-extrabold tracking-tight tabular-nums">
            Change {format.money(sale?.change ?? 0)}
          </p>
          {paid && <p className="text-sm text-muted-foreground">Paid {paid}</p>}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={onPrint}>
            <Printer aria-hidden="true" /> Print receipt
          </Button>
          <Button variant="outline" onClick={onLabels}>
            <Tag aria-hidden="true" /> Print labels
          </Button>
          <Button ref={next} onClick={onNext}>
            Next sale
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
