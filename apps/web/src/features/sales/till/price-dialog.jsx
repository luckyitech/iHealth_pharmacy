import { useMemo } from 'react';
import { z } from 'zod';

import { TextField } from '@/components/form/text-field';
import { useZodForm } from '@/components/form/use-zod-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useFormat } from '@/lib/format';

import { SALES_LABELS } from '../labels.js';

/**
 * Changing a line's price (VAT included). Any price other than the batch's needs a second
 * person's approval before payment.
 *
 * @param {object} props
 * @param {{ name: string, shelfPrice: string, price: string } | null} props.line
 * @param {(labelPrice: string | undefined) => void} props.onSave `undefined` puts the shelf price back.
 * @param {() => void} props.onClose
 * @returns {React.JSX.Element}
 */
export function PriceDialog({ line, onSave, onClose }) {
  return (
    <Dialog open={line !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Change the price" description={line?.name} className="max-w-sm">
        {line && <PriceForm key={line.name} line={line} onSave={onSave} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

/**
 * @param {{ line: { shelfPrice: string, price: string }, onSave: (labelPrice: string | undefined) => void, onClose: () => void }} props
 * @returns {React.JSX.Element}
 */
function PriceForm({ line, onSave, onClose }) {
  const format = useFormat();
  const schema = useMemo(
    () =>
      z.object({
        price: z
          .string()
          .trim()
          .regex(/^\d+(\.\d{1,2})?$/, 'Enter a price such as 116.00')
          .refine((value) => Number(value) > 0, 'Enter a price above zero'),
      }),
    [],
  );
  const form = useZodForm(schema, { defaultValues: { price: line.price } });
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={form.handleSubmit(({ price }) =>
        onSave(Number(price) === Number(line.shelfPrice) ? undefined : Number(price).toFixed(2)),
      )}
    >
      <TextField
        form={form}
        name="price"
        label={SALES_LABELS.PRICE_WITH_VAT}
        inputMode="decimal"
        hint={`Shelf price ${format.money(line.shelfPrice)}. Another price needs a second person's approval.`}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={() => onSave(undefined)}>
          Use the shelf price
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Change price</Button>
        </div>
      </div>
    </form>
  );
}
