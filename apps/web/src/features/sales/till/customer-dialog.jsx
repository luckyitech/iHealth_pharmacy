import { UserRound } from 'lucide-react';
import { z } from 'zod';

import { TextField } from '@/components/form/text-field';
import { useZodForm } from '@/components/form/use-zod-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { CustomerNameField } from '@/features/customers/customer-name-field';

/** Lengths of the bill's customer columns in the legacy `sales` table. */
const NAME_LENGTH = 100;
const PHONE_LENGTH = 20;

const typedCustomerSchema = z.object({
  name: z.string().trim().min(1, "Enter the customer's name").max(NAME_LENGTH),
  phone: z
    .string()
    .trim()
    .max(PHONE_LENGTH)
    .regex(/^(\+?[\d\s-]{6,20})?$/, 'Enter a phone number, e.g. 0712 345 678'),
});

/**
 * Who the sale is for: a registered customer, a name and phone typed on the bill, or a walk-in.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {(customer: import('./till-state.js').TillCustomer | null) => void} props.onChoose
 * @returns {React.JSX.Element}
 */
export function CustomerDialog({ open, onOpenChange, onChoose }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Customer"
        description="Type a name or phone: registered customers appear as you type. Or type a name for this bill only."
        className="max-w-lg"
      >
        {/* Mounted while open only, so the search starts empty each time. */}
        <CustomerChooser
          onChoose={(customer) => {
            onChoose(customer);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * One name box: registered customers drop down as the name is typed; picking one puts them on the
 * bill. A name that matches no one is kept on this bill only.
 *
 * @param {{ onChoose: (customer: import('./till-state.js').TillCustomer | null) => void }} props
 * @returns {React.JSX.Element}
 */
function CustomerChooser({ onChoose }) {
  const form = useZodForm(typedCustomerSchema, { defaultValues: { name: '', phone: '' } });

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={form.handleSubmit((values) =>
        onChoose({ name: values.name, phone: values.phone.replace(/[\s-]/g, '') || null }),
      )}
    >
      <div className="grid gap-3">
        <CustomerNameField
          form={form}
          name="name"
          label="Name"
          hint="Registered customers appear as you type."
          onPick={(customer) => onChoose(customer)}
        />
        <TextField form={form} name="phone" label="Phone" inputMode="tel" className="sm:max-w-60" />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={() => onChoose(null)}>
          <UserRound aria-hidden="true" /> Walk-in
        </Button>
        <Button type="submit">Use this name</Button>
      </div>
    </form>
  );
}
