import { BILL_STATUSES } from '@ihealth/shared/schemas';

import { cn } from '@/lib/utils';

import { ATTENTION_STATUSES, STATUS_LABELS } from './bill-labels.js';

/**
 * @param {{ status: string }} props
 * @returns {React.JSX.Element}
 */
export function BillStatus({ status }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        status === BILL_STATUSES.CANCELLED && 'border-destructive/40 text-destructive',
        ATTENTION_STATUSES.has(status) && 'border-warning/50 text-warning',
        status === BILL_STATUSES.PAID && 'text-muted-foreground',
      )}
    >
      {STATUS_LABELS[/** @type {keyof typeof STATUS_LABELS} */ (status)]}
    </span>
  );
}
