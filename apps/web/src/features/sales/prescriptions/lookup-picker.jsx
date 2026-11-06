import { MIN_PRESCRIBER_SEARCH_LENGTH } from '@ihealth/shared/schemas';
import { Loader2, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import { FormField } from '@/components/form/form-field';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

/** Searches wait this long after the last key. */
const SEARCH_DELAY_MS = 200;

/**
 * @typedef {{ id: number, label: string, detail?: string | null }} PickedOption
 */

/**
 * A box that finds a record as its name is typed and keeps the one picked (a doctor, a hospital).
 * Typing again drops the choice; the × clears it.
 *
 * @template T
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.placeholder
 * @param {PickedOption | null} props.value
 * @param {(value: (PickedOption & { row: T }) | null) => void} props.onChange
 * @param {(q: string, enabled: boolean) => import('@tanstack/react-query').UseQueryResult<T[]>} props.useSearch
 * @param {(row: T) => PickedOption} props.toOption
 * @param {string} props.failure What a failed search says, e.g. "Could not search the doctors".
 * @param {string} props.empty What an empty list says.
 * @param {(typed: string) => React.ReactNode} [props.footer] Under the matches, e.g. a way to add one.
 * @param {React.Ref<HTMLInputElement>} [props.inputRef]
 * @param {string} [props.error]
 * @param {boolean} [props.required]
 * @returns {React.JSX.Element}
 */
export function LookupPicker({
  label,
  placeholder,
  value,
  onChange,
  useSearch,
  toOption,
  failure,
  empty,
  footer,
  inputRef,
  error,
  required,
}) {
  const listId = useId();
  /** What was typed since the last choice; a choice shows its own name. */
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const typed = text.trim();
  const q = useDebouncedValue(typed, SEARCH_DELAY_MS);
  const searching = open && !value && q.length >= MIN_PRESCRIBER_SEARCH_LENGTH;
  const search = useSearch(q, searching);
  const options = searching ? (search.data ?? []).map((row) => ({ ...toOption(row), row })) : [];
  const answered =
    searching && search.data !== undefined && !search.isPlaceholderData && q === typed;
  const shown = searching && (options.length > 0 || answered);

  useEffect(() => {
    if (search.error) notify.failure(failure, search.error, { id: `lookup-${failure}` });
  }, [search.error, failure]);

  /**
   * @param {(typeof options)[number]} option
   * @returns {void}
   */
  const pick = (option) => {
    setText('');
    setOpen(false);
    onChange(option);
  };

  /**
   * @param {React.KeyboardEvent<HTMLInputElement>} event
   * @returns {void}
   */
  const onKeyDown = (event) => {
    if (!shown) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && options[active]) {
      event.preventDefault();
      pick(options[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <FormField label={label} error={error} required={required}>
      {(control) => (
        <div>
          <div className="relative">
            <Input
              {...control}
              ref={inputRef}
              role="combobox"
              aria-expanded={shown}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={shown && options[active] ? `${listId}-${active}` : undefined}
              spellCheck={false}
              placeholder={placeholder}
              className={cn(value && 'pr-9 font-medium')}
              value={value ? value.label : text}
              onChange={(event) => {
                setText(event.target.value);
                setActive(0);
                setOpen(true);
                if (value) onChange(null);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={onKeyDown}
            />
            {value ? (
              <button
                type="button"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                onClick={() => onChange(null)}
              >
                <X aria-hidden="true" className="size-4" />
                <span className="sr-only">Clear {label.toLowerCase()}</span>
              </button>
            ) : (
              search.isFetching &&
              searching && (
                <Loader2
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                />
              )
            )}
            {shown && (
              <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border bg-popover shadow-lg">
                <ul
                  id={listId}
                  role="listbox"
                  aria-label={label}
                  className="max-h-60 overflow-y-auto"
                >
                  {options.map((option, index) => (
                    // Keyboard choice happens in the box (aria-activedescendant); clicks are for mice and touch.
                    // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events
                    <li
                      key={option.id}
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={index === active}
                      className={cn(
                        'cursor-pointer border-b px-3 py-2 last:border-b-0',
                        index === active && 'bg-accent',
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => pick(option)}
                    >
                      <span className="block font-medium">{option.label}</span>
                      {option.detail && (
                        <span className="block text-xs text-muted-foreground">{option.detail}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {options.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">{empty}</p>
                )}
                {footer && (
                  // Clicks here must not blur the box first, or the list closes before they land.
                  // eslint-disable-next-line jsx-a11y-x/no-static-element-interactions
                  <div
                    className="border-t bg-muted/50"
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    {footer(typed)}
                  </div>
                )}
              </div>
            )}
          </div>
          {value?.detail && <p className="mt-1 text-xs text-muted-foreground">{value.detail}</p>}
        </div>
      )}
    </FormField>
  );
}
