import { MAX_LABEL_COPIES, MAX_LABEL_TEXT } from '@ihealth/shared/schemas';
import { Minus, Plus, Printer, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { PageState } from '@/components/feedback/page-state';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SHEET_ON_PHONE } from '@/components/ui/dialog-variants';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/lib/format';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

import { MedicineTag } from '../prescriptions/medicine-tag.jsx';
import { useTillSettings } from '../till/till-api.js';
import { printLabels, reprintLabels, useBillLabels } from './labels-api.js';

/**
 * @typedef {{ lineId: number, text: string, copies: number }} LabelDraft
 */

/**
 * @param {import('./labels-api.js').BillLabels['lines'][number]} line
 * @returns {LabelDraft} What the line starts with: the last print, else the item's usual instruction.
 */
function draftOf(line) {
  const text = line.savedText ?? line.suggestedText ?? '';
  const copies = line.savedCopies ?? (text || line.medicineKind ? 1 : 0);
  return { lineId: line.lineId, text, copies };
}

/**
 * Dosing stickers for a bill: one row per line, the dose prefilled from the last print or the
 * item's usual instruction, and how many stickers to print.
 *
 * @param {object} props
 * @param {number | null} props.billId Null while closed.
 * @param {() => void} props.onClose
 * @returns {React.JSX.Element}
 */
export function LabelsDialog({ billId, onClose }) {
  return (
    <Dialog open={billId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Print labels"
        description="The dose for each medicine, as it goes on the sticker."
        className={cn('max-w-3xl', SHEET_ON_PHONE)}
      >
        {/* Mounted while open only, so each bill starts from its own lines. */}
        {billId !== null && <LabelsEditor billId={billId} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

/**
 * @param {{ billId: number, onDone: () => void }} props
 * @returns {React.JSX.Element}
 */
function LabelsEditor({ billId, onDone }) {
  const format = useFormat();
  const labels = useBillLabels(billId);
  const settings = useTillSettings();
  const [drafts, setDrafts] = useState(/** @type {Map<number, LabelDraft> | null} */ (null));
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (labels.error) notify.failure('Could not load the bill for its labels', labels.error);
  }, [labels.error]);

  if (labels.isPending) return <PageState state="loading" />;
  if (!labels.data) return <PageState state="error" error={labels.error} />;

  const lines = labels.data.lines;
  /**
   * @param {number} lineId
   * @returns {LabelDraft}
   */
  const draft = (lineId) =>
    drafts?.get(lineId) ??
    draftOf(/** @type {(typeof lines)[number]} */ (lines.find((line) => line.lineId === lineId)));
  /**
   * @param {number} lineId
   * @param {Partial<LabelDraft>} change
   * @returns {void}
   */
  const change = (lineId, change) =>
    setDrafts((current) => {
      const next = new Map(current ?? lines.map((line) => [line.lineId, draftOf(line)]));
      next.set(lineId, { ...draft(lineId), ...change });
      return next;
    });

  const all = lines.map((line) => draft(line.lineId));
  const stickers = all.reduce((sum, item) => sum + item.copies, 0);
  const missingDose = all.some((item) => item.copies > 0 && !item.text.trim());

  const print = async () => {
    if (missingDose) {
      notify.info('Enter the dose for every sticker, or set its count to 0.');
      return;
    }
    setPrinting(true);
    try {
      await printLabels(
        billId,
        all.map((item) => ({ ...item, text: item.text.trim() })),
      );
      notify.success(`${stickers} ${stickers === 1 ? 'label' : 'labels'} sent to print`);
      onDone();
    } catch (error) {
      notify.failure('Could not print the labels', error);
    } finally {
      setPrinting(false);
    }
  };

  const reprint = async () => {
    setPrinting(true);
    try {
      await reprintLabels(billId);
    } catch (error) {
      notify.failure('Could not reprint the labels', error);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="grid gap-4">
      <ul className="grid gap-3">
        {lines.map((line) => {
          const item = draft(line.lineId);
          const name = line.itemName ?? 'This item';
          return (
            <li
              key={line.lineId}
              className={cn(
                'grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto]',
                item.copies === 0 && 'bg-muted/40',
              )}
            >
              <div className="grid gap-2">
                <p className="font-medium">
                  {name}
                  <MedicineTag
                    kind={line.medicineKind}
                    types={settings.data?.medicineTypes ?? []}
                  />
                  <span className="block text-xs font-normal text-muted-foreground">
                    {line.quantity} sold · Batch {line.batchNo ?? '—'}
                    {line.expiryDate && ` · expires ${format.date(line.expiryDate)}`}
                  </span>
                </p>
                <Textarea
                  aria-label={`Dose for ${name}`}
                  rows={2}
                  maxLength={MAX_LABEL_TEXT}
                  placeholder="e.g. Take one tablet 3 times a day after meals"
                  className="min-h-14"
                  value={item.text}
                  onChange={(event) => change(line.lineId, { text: event.target.value })}
                />
              </div>
              <div className="grid content-start gap-1 sm:justify-items-end">
                <span className="text-xs text-muted-foreground" id={`copies-${line.lineId}`}>
                  Stickers
                </span>
                <span className="inline-flex items-center overflow-hidden rounded-md border bg-background">
                  <button
                    type="button"
                    className="grid size-9 place-items-center hover:bg-accent disabled:opacity-40"
                    aria-label={`One sticker fewer for ${name}`}
                    disabled={item.copies === 0}
                    onClick={() => change(line.lineId, { copies: item.copies - 1 })}
                  >
                    <Minus aria-hidden="true" className="size-4" />
                  </button>
                  <output
                    aria-labelledby={`copies-${line.lineId}`}
                    className="w-9 text-center font-semibold tabular-nums"
                  >
                    {item.copies}
                  </output>
                  <button
                    type="button"
                    className="grid size-9 place-items-center hover:bg-accent disabled:opacity-40"
                    aria-label={`One sticker more for ${name}`}
                    disabled={item.copies >= MAX_LABEL_COPIES}
                    onClick={() => change(line.lineId, { copies: item.copies + 1 })}
                  >
                    <Plus aria-hidden="true" className="size-4" />
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {/* The buttons stay in view while a long bill scrolls. */}
      <div className="sticky -bottom-6 -mx-6 -mb-6 flex flex-col-reverse gap-2 border-t bg-card px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
        {labels.data.printedBefore && (
          <Button
            variant="ghost"
            className="sm:mr-auto"
            disabled={printing}
            onClick={() => void reprint()}
          >
            <RotateCcw aria-hidden="true" /> Reprint last labels
          </Button>
        )}
        <Button variant="outline" onClick={onDone}>
          Skip
        </Button>
        <Button disabled={printing || stickers === 0} onClick={() => void print()}>
          <Printer aria-hidden="true" />
          {stickers ? `Print ${stickers} ${stickers === 1 ? 'label' : 'labels'}` : 'Print labels'}
        </Button>
      </div>
    </div>
  );
}
