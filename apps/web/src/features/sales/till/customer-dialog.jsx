import { MIN_CUSTOMER_SEARCH_LENGTH } from '@ihealth/shared/schemas';
import { Loader2, Search, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { TextField } from '@/components/form/text-field';
import { useZodForm } from '@/components/form/use-zod-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { notify } from '@/lib/notify';

import { useCustomerSearch } from './till-api.js';

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
        description="Find a registered customer, or type a name for this bill."
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
 * @param {{ onChoose: (customer: import('./till-state.js').TillCustomer | null) => void }} props
 * @returns {React.JSX.Element}
 */
function CustomerChooser({ onChoose }) {
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim());
  const enabled = q.length >= MIN_CUSTOMER_SEARCH_LENGTH;
  const customers = useCustomerSearch(q, enabled);
  const form = useZodForm(typedCustomerSchema, { defaultValues: { name: '', phone: '' } });

  useEffect(() => {
    if (customers.error)
      notify.failure('Could not search the customers', customers.error, { id: 'till-customers' });
  }, [customers.error]);

  const choose = onChoose;

  return (
    <>
      <div className="grid gap-2">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search customers by name or phone"
            placeholder="Name or phone"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {enabled && (
          <ul
            aria-label="Matching customers"
            className="max-h-56 overflow-y-auto rounded-md border"
          >
            {customers.isFetching && !customers.data && (
              <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Searching…
              </li>
            )}
            {customers.data?.map((customer) => (
              <li key={customer.id} className="border-b last:border-b-0">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  onClick={() => choose(customer)}
                >
                  <span className="font-medium">{customer.name}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {customer.phone ?? ''}
                  </span>
                </button>
              </li>
            ))}
            {customers.data?.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                No customer matches “{q}”.
              </li>
            )}
          </ul>
        )}
      </div>

      <form
        className="grid gap-3 border-t pt-4"
        noValidate
        onSubmit={form.handleSubmit((values) =>
          choose({ name: values.name, phone: values.phone.replace(/[\s-]/g, '') || null }),
        )}
      >
        <p className="text-sm font-medium">Or type a name for this bill only</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField form={form} name="name" label="Name" autoComplete="off" />
          <TextField form={form} name="phone" label="Phone" inputMode="tel" autoComplete="off" />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => choose(null)}>
            <UserRound aria-hidden="true" /> Walk-in
          </Button>
          <Button type="submit" variant="secondary">
            Use this name
          </Button>
        </div>
      </form>
    </>
  );
}
