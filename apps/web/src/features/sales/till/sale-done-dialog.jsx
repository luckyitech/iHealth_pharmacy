import { Check, Printer } from 'lucide-react';
import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useFormat } from '@/lib/format';

import { METHOD_LABELS } from '../history/bill-labels.js';
import { KEY_LABELS, TILL_KEYS } from './till-keys.js';

/**
 * The sale is saved: the bill number and, large, the change to give. P prints the receipt; Enter
 * (the focused button) starts the next sale.
 *
 * @param {object} props
 * @param {import('./till-api.js').CompletedSale | null} props.sale
 * @param {() => void} props.onPrint
 * @param {() => void} props.onNext
 * @param {React.RefObject<HTMLElement | null>} props.returnFocusTo Where the cashier carries on (the search).
 * @returns {React.JSX.Element}
 */
export function SaleDoneDialog({ sale, onPrint, onNext, returnFocusTo }) {
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
          if (event.key.toLowerCase() === TILL_KEYS.PRINT && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            onPrint();
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
            <Kbd decorative className="hidden sm:inline-flex">
              {KEY_LABELS.PRINT}
            </Kbd>
          </Button>
          <Button ref={next} onClick={onNext}>
            Next sale
            <Kbd
              decorative
              className="hidden border-primary-foreground/40 bg-transparent text-primary-foreground sm:inline-flex"
            >
              {KEY_LABELS.CONFIRM}
            </Kbd>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
