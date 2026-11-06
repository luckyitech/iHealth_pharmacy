/* eslint-disable jsdoc/reject-any-type -- works with any form that has a customer name field */
import { MIN_CUSTOMER_SEARCH_LENGTH } from '@ihealth/shared/schemas';
import { Loader2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import { FormField } from '@/components/form/form-field';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

import { useCustomerSearch } from './customers-api.js';

/** Searches wait this long after the last key. */
const SEARCH_DELAY_MS = 200;

/**
 * A customer name box that offers registered customers as the name is typed: from two
 * characters, matching names and phones drop down; ↑ ↓ and Enter, or a click, picks one. Typing
 * on without picking keeps the name as typed.
 *
 * @param {object} props
 * @param {import('react-hook-form').UseFormReturn<any>} props.form
 * @param {string} props.name The form's name field.
 * @param {string} props.label
 * @param {(customer: import('./customers-api.js').CustomerOption) => void} props.onPick
 * @param {React.ReactNode} [props.hint]
 * @param {string} [props.className]
 * @returns {React.JSX.Element}
 */
export function CustomerNameField({ form, name, label, onPick, hint, className }) {
  const listId = useId();
  const typed = String(form.watch(name) ?? '').trim();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = useDebouncedValue(typed, SEARCH_DELAY_MS);
  const enabled = q.length >= MIN_CUSTOMER_SEARCH_LENGTH;
  const search = useCustomerSearch(q, enabled && open);
  const customers = enabled ? (search.data ?? []) : [];
  const answered = enabled && !search.isPlaceholderData && search.data !== undefined && q === typed;
  const shown =
    open && typed.length >= MIN_CUSTOMER_SEARCH_LENGTH && (customers.length > 0 || answered);
  const error = /** @type {{ message?: string } | undefined} */ (form.formState.errors[name])
    ?.message;
  const { onChange, onBlur, ...registered } = form.register(name);

  useEffect(() => {
    if (search.error)
      notify.failure('Could not search the customers', search.error, { id: 'customer-search' });
  }, [search.error]);

  /**
   * @param {import('./customers-api.js').CustomerOption} customer
   * @returns {void}
   */
  const pick = (customer) => {
    setOpen(false);
    onPick(customer);
  };

  /**
   * @param {React.KeyboardEvent<HTMLInputElement>} event
   * @returns {void}
   */
  const onKeyDown = (event) => {
    if (!shown) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, customers.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && customers[active]) {
      event.preventDefault();
      pick(customers[active]);
    } else if (event.key === 'Escape') {
      // Closes the list only, not the window it is in.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <FormField
      form={form}
      name={name}
      label={label}
      error={error}
      hint={hint}
      className={className}
    >
      {(control) => (
        <div className="relative">
          <Input
            {...control}
            {...registered}
            role="combobox"
            aria-expanded={shown}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={shown && customers[active] ? `${listId}-${active}` : undefined}
            spellCheck={false}
            placeholder="Type a name or phone"
            onChange={(event) => {
              void onChange(event);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={(event) => {
              void onBlur(event);
              setOpen(false);
            }}
            onKeyDown={onKeyDown}
          />
          {search.isFetching && open && (
            <Loader2
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          )}
          {shown && (
            <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border bg-popover shadow-lg">
              <ul
                id={listId}
                role="listbox"
                aria-label="Registered customers"
                className="max-h-64 overflow-y-auto"
              >
                {customers.map((customer, index) => (
                  // Keyboard choice happens in the box (aria-activedescendant); clicks are for mice and touch.
                  // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events
                  <li
                    key={customer.id}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    className={cn(
                      'grid cursor-pointer grid-cols-[1fr_auto] gap-x-3 border-b px-3 py-2 last:border-b-0',
                      index === active && 'bg-accent',
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(customer)}
                  >
                    <span className="truncate font-medium">{customer.name}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {customer.phone ?? ''}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Customer no. {customer.id}
                    </span>
                  </li>
                ))}
              </ul>
              {customers.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">No customer found</p>
              )}
              <p className="hidden gap-4 border-t bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground sm:flex">
                <span>
                  <Kbd decorative>↑</Kbd> <Kbd decorative>↓</Kbd> choose
                </span>
                <span>
                  <Kbd decorative>Enter</Kbd> pick
                </span>
                <span>
                  <Kbd decorative>Esc</Kbd> close
                </span>
              </p>
            </div>
          )}
        </div>
      )}
    </FormField>
  );
}
