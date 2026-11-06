import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';
import { useFormat } from '@/lib/format';

import { KEY_LABELS } from './till-keys.js';
import { SALES_LABELS } from '../labels.js';

/**
 * @typedef {import('./till-api.js').SaleQuote['totals']} QuoteTotals
 */

/**
 * The totals and the Pay button. Every figure is the server's.
 *
 * @param {object} props
 * @param {QuoteTotals} props.totals
 * @param {number} props.lineCount
 * @param {number} props.units
 * @param {boolean} props.updating The prices are being worked out again.
 * @param {string | null} props.blocked Why the sale cannot be paid yet, or null.
 * @param {() => void} props.onPay
 * @param {number} props.toApprove Lines that need a second person's approval.
 * @param {boolean} props.approved Whether they are approved, as they are now.
 * @returns {React.JSX.Element}
 */
export function SaleTotals({
  totals,
  lineCount,
  units,
  updating,
  blocked,
  onPay,
  toApprove,
  approved,
}) {
  const askApproval = toApprove > 0 && !approved;
  const format = useFormat();
  /** @type {[string, string][]} */
  const rows = [
    // The names staff know from the legacy billing screen.
    [SALES_LABELS.TOTAL_ITEMS, String(lineCount)],
    [SALES_LABELS.TOTAL_QTY, String(units)],
    [SALES_LABELS.TOTAL_AMOUNT, format.money(totals.gross)],
    [
      SALES_LABELS.TOTAL_DISCOUNT,
      Number(totals.discount) ? `−${format.money(totals.discount)}` : format.money(0),
    ],
    [SALES_LABELS.VAT, format.money(totals.vat)],
    [SALES_LABELS.ROUND_OFF, format.money(totals.roundedOff)],
  ];
  return (
    <section aria-label="Totals" className="grid gap-3 rounded-lg border bg-card p-4">
      <dl className="grid gap-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-baseline justify-between gap-4 border-t pt-3">
        <span className="text-sm font-medium">{SALES_LABELS.NET_AMOUNT}</span>
        <output aria-live="polite" className="text-3xl font-bold tracking-tight tabular-nums">
          {format.money(totals.net)}
        </output>
      </div>
      {askApproval && (
        <div className="rounded-md bg-warning/20 px-3 py-2 text-sm">
          <p className="font-semibold">
            {toApprove} {toApprove === 1 ? 'line needs' : 'lines need'} approval
          </p>
          <p className="text-muted-foreground">
            Someone with “Sales approval” enters their PIN before payment.
          </p>
        </div>
      )}
      <Button
        size="lg"
        className={cn(
          'h-13 text-base font-bold',
          askApproval && 'bg-warning text-foreground hover:bg-warning/90',
        )}
        disabled={Boolean(blocked)}
        onClick={onPay}
      >
        {askApproval ? 'Get approval' : 'Pay'}
        <Kbd
          decorative
          className="border-primary-foreground/40 bg-transparent text-primary-foreground"
        >
          {KEY_LABELS.PAY}
        </Kbd>
      </Button>
      <p
        className="flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground"
        aria-live="polite"
      >
        {updating ? (
          <>
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> Updating prices…
          </>
        ) : (
          (blocked ?? 'Prices, VAT and stock are checked by the server.')
        )}
      </p>
    </section>
  );
}
