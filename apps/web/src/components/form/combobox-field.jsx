/* eslint-disable jsdoc/reject-any-type -- works with any form and any resource row */
import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useId, useState } from 'react';
import { useController } from 'react-hook-form';

import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useResourceList } from '@/lib/resource-api';
import { cn } from '@/lib/utils';

import { FormField } from './form-field.jsx';
import { isRequiredField } from './use-zod-form.js';

/** Matches shown at once; typing narrows them down. */
const RESULT_LIMIT = 20;
const ACTIVE_ONLY = Object.freeze({ status: 'active' });

/**
 * A searchable select for long lists (thousands of generic names or manufacturers): the user types,
 * the API searches, and the first matches are offered. The field holds the chosen record's id.
 *
 * @param {object} props
 * @param {import('react-hook-form').UseFormReturn<any>} props.form
 * @param {string} props.name
 * @param {string} props.label
 * @param {string} props.resource API list to search, e.g. `masters/manufacturers`.
 * @param {string | null} [props.selectedLabel] Name of the record already chosen (from the edited item).
 * @param {(row: any) => string} [props.optionLabel] Defaults to the name, or the code for legacy rows without one.
 * @param {string} [props.placeholder]
 * @param {React.ReactNode} [props.hint]
 * @returns {React.JSX.Element}
 */
export function ComboboxField({
  form,
  name,
  label,
  resource,
  selectedLabel = null,
  optionLabel = (row) => row.name || row.code,
  placeholder = 'Search…',
  hint,
}) {
  const { field, fieldState } = useController({ name, control: form.control });
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  /** The record picked here; until then the field shows `selectedLabel` (the stored choice). */
  const [picked, setPicked] = useState(/** @type {{ id: unknown, label: string } | null} */ (null));
  const [activeIndex, setActiveIndex] = useState(0);
  const q = useDebouncedValue(search);
  const listboxId = useId();

  const results = useResourceList(
    resource,
    { page: 1, pageSize: RESULT_LIMIT, sort: 'name', q, filters: ACTIVE_ONLY },
    { enabled: open },
  );
  const rows = open
    ? /** @type {any[]} */ (/** @type {{ data?: any[] } | undefined} */ (results.data)?.data ?? [])
    : [];

  // Until the latest search has answered, the list shows the previous matches: they cannot be picked with Enter.
  const stale = search !== q || results.isPlaceholderData;

  /** @param {any | null} row */
  const choose = (row) => {
    field.onChange(row ? row.id : '');
    setPicked(row ? { id: row.id, label: optionLabel(row) || `#${row.id}` } : null);
    setOpen(false);
    setSearch('');
  };

  /** @param {React.KeyboardEvent} event */
  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, rows.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      // Never submit the surrounding form from the search box.
      event.preventDefault();
      if (!stale && rows[activeIndex]) choose(rows[activeIndex]);
    }
  };

  const hasValue = field.value !== '' && field.value !== null && field.value !== undefined;
  const chosenLabel = picked && picked.id === field.value ? picked.label : selectedLabel;
  const optionId = (/** @type {number} */ index) => `${listboxId}-${index}`;

  return (
    <FormField form={form} name={name} label={label} error={fieldState.error?.message} hint={hint}>
      {(control) => (
        <Popover.Root
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            setActiveIndex(0);
          }}
        >
          <div className="relative">
            <Popover.Trigger asChild>
              <button
                {...control}
                ref={field.ref}
                type="button"
                role="combobox"
                aria-expanded={open}
                aria-controls={listboxId}
                onBlur={field.onBlur}
                className={cn(
                  'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs outline-none',
                  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  'disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
                  hasValue && 'pr-14',
                )}
              >
                <span className={cn('truncate', !hasValue && 'text-muted-foreground')}>
                  {hasValue ? (chosenLabel ?? `#${field.value}`) : placeholder}
                </span>
                <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 opacity-50" />
              </button>
            </Popover.Trigger>
            {hasValue && !isRequiredField(form, name) && (
              <button
                type="button"
                aria-label={`Clear ${label.toLowerCase()}`}
                className="absolute top-1/2 right-8 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                onClick={() => choose(null)}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={4}
              className="z-50 w-(--radix-popover-trigger-width) min-w-64 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            >
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                />
                {/* The popover moves focus here when it opens. */}
                <Input
                  aria-label={`Search ${label.toLowerCase()}`}
                  aria-controls={listboxId}
                  aria-activedescendant={rows[activeIndex] ? optionId(activeIndex) : undefined}
                  className="pl-8"
                  placeholder={placeholder}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={onKeyDown}
                />
              </div>
              <ul
                id={listboxId}
                role="listbox"
                aria-label={label}
                aria-busy={stale}
                className={cn('mt-1 max-h-64 overflow-y-auto', stale && 'opacity-60')}
              >
                {results.isFetching && rows.length === 0 && (
                  <li className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Searching…
                  </li>
                )}
                {!results.isFetching && rows.length === 0 && (
                  <li className="px-2 py-2 text-sm text-muted-foreground">No matches</li>
                )}
                {rows.map((row, index) => {
                  const selected = row.id === field.value;
                  return (
                    // Options are chosen with the arrow keys and Enter in the search box (aria-activedescendant).
                    // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events
                    <li
                      key={row.id}
                      id={optionId(index)}
                      role="option"
                      aria-selected={selected}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                        index === activeIndex && 'bg-accent text-accent-foreground',
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(row)}
                    >
                      <Check
                        aria-hidden="true"
                        className={cn('size-4 shrink-0', !selected && 'invisible')}
                      />
                      <span className="truncate">{optionLabel(row) || `#${row.id}`}</span>
                    </li>
                  );
                })}
              </ul>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </FormField>
  );
}
