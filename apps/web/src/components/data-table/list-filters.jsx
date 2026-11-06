import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

/**
 * The search box above a list, kept in step with the list's `q` after the user stops typing.
 *
 * @param {object} props
 * @param {string} props.label Read out by screen readers, e.g. "Search bills".
 * @param {string} props.placeholder What can be searched, e.g. "Search by bill number, customer name or phone".
 * @param {string} props.value The list's `q`.
 * @param {(q: string) => void} props.onSearch
 * @returns {React.JSX.Element}
 */
export function ListSearch({ label, placeholder, value, onSearch }) {
  const [search, setSearch] = useState(value);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== value) onSearch(debounced);
  }, [debounced, value, onSearch]);

  return (
    <div className="relative min-w-56 flex-1">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        className="pl-9"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
    </div>
  );
}

/**
 * From and To dates above a list (`from` and `to` filters, `YYYY-MM-DD`).
 *
 * @param {object} props
 * @param {string} props.id Prefix of the inputs' ids, e.g. "bills".
 * @param {string | undefined} props.from
 * @param {string | undefined} props.to
 * @param {(change: { from?: string, to?: string }) => void} props.onChange
 * @param {string} [props.max] The latest date that can be chosen.
 * @returns {React.JSX.Element}
 */
export function DateRangeFilter({ id, from, to, onChange, max }) {
  return (
    <>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <label htmlFor={`${id}-from`}>From</label>
        <Input
          id={`${id}-from`}
          type="date"
          className="w-40"
          value={from ?? ''}
          max={to ?? max}
          onChange={(event) => onChange({ from: event.target.value })}
        />
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <label htmlFor={`${id}-to`}>To</label>
        <Input
          id={`${id}-to`}
          type="date"
          className="w-40"
          value={to ?? ''}
          min={from}
          max={max}
          onChange={(event) => onChange({ to: event.target.value })}
        />
      </div>
    </>
  );
}
