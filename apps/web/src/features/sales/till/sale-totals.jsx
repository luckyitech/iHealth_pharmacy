import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useFormat } from '@/lib/format';

import { KEY_LABELS } from './till-keys.js';

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
 * @returns {React.JSX.Element}
 */
export function SaleTotals({ totals, lineCount, units, updating, blocked, onPay }) {
  const format = useFormat();
  /** @type {[string, string][]} */
  const rows = [
    [
      'Items',
      `${lineCount} ${lineCount === 1 ? 'line' : 'lines'} · ${units} ${units === 1 ? 'unit' : 'units'}`,
    ],
    ['Before discount', format.money(totals.gross)],
    ['Discount', Number(totals.discount) ? `−${format.money(totals.discount)}` : format.money(0)],
    ['VAT included', format.money(totals.vat)],
    ['Rounded', format.money(totals.roundedOff)],
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
        <span className="text-sm font-medium">To pay</span>
        <output aria-live="polite" className="text-3xl font-bold tracking-tight tabular-nums">
          {format.money(totals.net)}
        </output>
      </div>
      <Button
        size="lg"
        className="h-13 text-base font-bold"
        disabled={Boolean(blocked)}
        onClick={onPay}
      >
        Pay
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
