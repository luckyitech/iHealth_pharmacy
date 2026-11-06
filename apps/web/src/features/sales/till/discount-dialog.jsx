import { useMemo } from 'react';
import { z } from 'zod';

import { TextField } from '@/components/form/text-field';
import { useZodForm } from '@/components/form/use-zod-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';

/** A discount cannot be more than the whole price. */
const MAX_PERCENT = 100;

/**
 * A line discount, in percent. Up to the limit a cashier may give it alone; more needs a second
 * person's approval before payment.
 *
 * @param {object} props
 * @param {{ name: string, discountPercent: number } | null} props.line
 * @param {number} props.limit
 * @param {(discountPercent: number) => void} props.onSave
 * @param {() => void} props.onClose
 * @returns {React.JSX.Element}
 */
export function DiscountDialog({ line, limit, onSave, onClose }) {
  return (
    <Dialog open={line !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Discount" description={line?.name} className="max-w-sm">
        {line && (
          <DiscountForm
            key={line.name}
            line={line}
            limit={limit}
            onSave={onSave}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * @param {{ line: { discountPercent: number }, limit: number, onSave: (discountPercent: number) => void, onClose: () => void }} props
 * @returns {React.JSX.Element}
 */
function DiscountForm({ line, limit, onSave, onClose }) {
  const schema = useMemo(
    () =>
      z.object({
        discountPercent: z.coerce
          .number({ error: 'Enter a number' })
          .min(0, 'Cannot be negative')
          .max(MAX_PERCENT, `Use at most ${MAX_PERCENT}`),
      }),
    [],
  );
  const form = useZodForm(schema, {
    defaultValues: { discountPercent: String(line.discountPercent) },
  });
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={form.handleSubmit((values) => onSave(values.discountPercent))}
    >
      <TextField
        form={form}
        name="discountPercent"
        label="Discount (%)"
        inputMode="decimal"
        hint={`Up to ${limit}% without approval; more needs a second person's PIN. Taken off before VAT.`}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">Apply discount</Button>
      </div>
    </form>
  );
}
