import { useId, useState } from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Codes offered at once as one is typed. */
const SHOWN = 6;
/** A legacy code may list several spellings: "a.m., am, AM". */
const SPELLINGS = /\s*,\s*/;

/**
 * @param {import('./labels-api.js').LabelCode} code
 * @param {string} q Lower case.
 * @returns {boolean} One of the code's spellings starts with what was typed.
 */
const codeStarts = (code, q) =>
  code.code
    .toLowerCase()
    .split(SPELLINGS)
    .some((spelling) => spelling.startsWith(q));

/**
 * A small box for the pharmacist's label codes: type `1t`, `bds` or `ac` and Enter (or a click)
 * adds its words to the dose, as the legacy app's label codes did.
 *
 * @param {object} props
 * @param {import('./labels-api.js').LabelCode[]} props.codes
 * @param {(text: string) => void} props.onAdd
 * @param {string} props.label For screen readers, e.g. "Add a code to the dose of …".
 * @returns {React.JSX.Element}
 */
export function CodeAdder({ codes, onAdd, label }) {
  const listId = useId();
  const [typed, setTyped] = useState('');
  const [active, setActive] = useState(0);
  const q = typed.trim().toLowerCase();
  // A code matches by its start; words of the dose match anywhere.
  const matches = q
    ? [
        ...codes.filter((code) => codeStarts(code, q)),
        ...codes.filter((code) => !codeStarts(code, q) && code.text.toLowerCase().includes(q)),
      ].slice(0, SHOWN)
    : [];
  const shown = matches.length > 0;

  /**
   * @param {import('./labels-api.js').LabelCode} code
   * @returns {void}
   */
  const add = (code) => {
    onAdd(code.text);
    setTyped('');
    setActive(0);
  };

  return (
    <div className="relative">
      <Input
        role="combobox"
        aria-label={label}
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown ? `${listId}-${active}` : undefined}
        placeholder="Add a code, e.g. 1t, bds"
        className="h-9"
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (!shown) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, matches.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            add(matches[active]);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setTyped('');
          }
        }}
      />
      {shown && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Label codes"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover shadow-lg"
        >
          {matches.map((code, index) => (
            // Keyboard choice happens in the box (aria-activedescendant); clicks are for mice and touch.
            // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events
            <li
              key={`${code.code}-${index}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={cn(
                'flex cursor-pointer gap-3 border-b px-3 py-1.5 text-sm last:border-b-0',
                index === active && 'bg-accent',
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => add(code)}
            >
              <span className="w-20 shrink-0 font-mono text-xs leading-5 font-semibold">
                {code.code}
              </span>
              <span>{code.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
