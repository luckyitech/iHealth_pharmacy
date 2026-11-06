import { MEDICINE_KINDS } from '@ihealth/shared/schemas';

import { cn } from '@/lib/utils';

import { MEDICINE_TAGS } from './medicine.js';

const TAG_STYLES = Object.freeze({
  [MEDICINE_KINDS.PRESCRIPTION]: 'bg-primary/10 text-primary',
  [MEDICINE_KINDS.CONTROLLED]: 'bg-destructive/10 text-destructive',
  [MEDICINE_KINDS.ANTIBIOTIC]: 'bg-warning/25 text-foreground',
});

/**
 * The small tag on a prescription-only, controlled or antibiotic medicine.
 *
 * @param {object} props
 * @param {import('./medicine.js').MedicineKind | null | undefined} props.kind
 * @param {import('./medicine.js').MedicineType[]} props.types The pharmacy's names for each kind.
 * @param {string} [props.className]
 * @returns {React.JSX.Element | null}
 */
export function MedicineTag({ kind, types, className }) {
  if (!kind) return null;
  const name = types.find((type) => type.kind === kind)?.name ?? kind;
  return (
    <abbr
      title={name}
      className={cn(
        'ml-1.5 inline-flex rounded-full px-1.5 py-px align-[1px] text-[0.6875rem] font-bold tracking-wide no-underline',
        TAG_STYLES[kind],
        className,
      )}
    >
      {MEDICINE_TAGS[kind]}
      <span className="sr-only">: {name}</span>
    </abbr>
  );
}
