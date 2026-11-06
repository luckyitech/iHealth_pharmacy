import { LINE_WARNINGS } from '@ihealth/shared/schemas';
import { useQueryClient } from '@tanstack/react-query';
import { PauseCircle, UserRound } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/hooks/use-confirm';
import { isApiError } from '@/lib/api-error';
import { useFormat } from '@/lib/format';
import { notify } from '@/lib/notify';

import { openReceipt } from '../history/sales-api.js';
import { approvalErrorsOf } from '../approvals/approval-entry.js';
import { ApprovalDialog } from './approval-dialog.jsx';
import { CustomerDialog } from './customer-dialog.jsx';
import { DiscountDialog } from './discount-dialog.jsx';
import { HeldSaleRow, HeldSalesDialog } from './held-sales-dialog.jsx';
import { ItemSearch } from './item-search.jsx';
import { PaymentDialog } from './payment-dialog.jsx';
import { PriceDialog } from './price-dialog.jsx';
import { SaleDoneDialog } from './sale-done-dialog.jsx';
import { SaleLines } from './sale-lines.jsx';
import { SaleTotals } from './sale-totals.jsx';
import {
  fetchQuote,
  quoteKey,
  useCompleteSale,
  useDiscardHeldSale,
  useHeldSales,
  useHoldSale,
  useQuote,
  useRecallSale,
  useApproveSale,
  useBanks,
  useTillSettings,
} from './till-api.js';
import { problemKey } from './payment.js';
import { TILL_KEYS } from './till-keys.js';
import { customerForApi, linesForApi, newSale, tillReducer, ZERO_TOTALS } from './till-state.js';
import { SALES_LABELS } from '../labels.js';
import { NEEDS_PRESCRIPTION } from '../prescriptions/medicine.js';
import { NO_PRESCRIPTION, prescriptionForApi } from '../prescriptions/prescription.js';
import { PrescriptionStrip } from '../prescriptions/prescription-strip.jsx';

/** Held sales listed beside the till; the rest are in the Held sales window. */
const HELD_SHOWN = 4;

/** @typedef {'pay' | 'customer' | 'discount' | 'price' | 'approval' | 'held' | null} OpenDialog */

/**
 * Which payment field a server problem belongs to, keyed like the payment window's problems.
 *
 * @param {string} path e.g. `body.payments.1.reference`
 * @param {Record<string, unknown>[]} payments As sent.
 * @returns {string | null}
 */
function paymentField(path, payments) {
  const match = /^body\.payments(?:\.(\d+)\.(\w+))?$/.exec(path);
  if (!match) return null;
  if (!match[1]) return problemKey('payments', 'total');
  return problemKey(String(payments[Number(match[1])]?.method), match[2]);
}

/**
 * Why a priced sale cannot be paid yet.
 *
 * @param {import('./till-api.js').SaleQuote} priced
 * @returns {string | null}
 */
function lineProblem(priced) {
  const warnings = new Set(priced.lines.flatMap((line) => line.warnings));
  if (warnings.has(LINE_WARNINGS.EXPIRED)) return 'Remove the expired batch to take payment.';
  if (warnings.has(LINE_WARNINGS.INSUFFICIENT_STOCK))
    return 'A line asks for more than is in stock.';
  return null;
}

/**
 * The sales screen: scan or search, adjust lines, then F9 to take the payment. Keyboard first, and
 * every price is the server's.
 *
 * @returns {React.JSX.Element}
 */
export default function SalesScreenPage() {
  const format = useFormat();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(tillReducer, undefined, newSale);
  const [dialog, setDialog] = useState(/** @type {OpenDialog} */ (null));
  const [done, setDone] = useState(
    /** @type {import('./till-api.js').CompletedSale | null} */ (null),
  );
  const [paymentErrors, setPaymentErrors] = useState({});
  /** A second person's approval, for the lines exactly as they were approved. */
  const [approval, setApproval] = useState(
    /** @type {{ token: string, key: string } | null} */ (null),
  );
  const [approvalErrors, setApprovalErrors] = useState({});
  const [prescription, setPrescription] = useState(
    /** @type {import('../prescriptions/prescription.js').TillPrescription} */ (NO_PRESCRIPTION),
  );
  const searchRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const doctorRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const { ask, dialog: confirmDialog } = useConfirm();

  const settings = useTillSettings();
  const banks = useBanks();
  const lines = useMemo(() => linesForApi(state), [state]);
  const quote = useQuote(lines);
  const held = useHeldSales();
  const complete = useCompleteSale();
  const hold = useHoldSale();
  const recall = useRecallSale();
  const discard = useDiscardHeldSale();
  const approve = useApproveSale();

  useEffect(() => {
    if (quote.error)
      notify.failure('Could not work out the prices', quote.error, { id: 'till-quote' });
  }, [quote.error]);
  useEffect(() => {
    if (held.error)
      notify.failure('Could not load the held sales', held.error, { id: 'till-held' });
  }, [held.error]);

  const focusSearch = useCallback(() => searchRef.current?.focus(), []);
  const current = quote.data && !quote.isPlaceholderData ? quote.data : undefined;
  const totals = lines.length ? (quote.data?.totals ?? ZERO_TOTALS) : ZERO_TOTALS;
  const units = state.lines.reduce((sum, line) => sum + line.quantity, 0);
  const updating = lines.length > 0 && (quote.isFetching || quote.isPlaceholderData);

  /** @type {string | null} */
  let blocked = null;
  if (!lines.length) blocked = 'Add an item to take payment.';
  else if (quote.error) blocked = 'The prices could not be worked out. Check the lines.';
  else if (current) blocked = lineProblem(current);

  const linesKey = JSON.stringify(lines);
  const approvedToken = approval?.key === linesKey ? approval.token : null;
  const toApprove = (current?.lines ?? []).filter((line) => line.needsApproval.length);
  const medicineTypes = settings.data?.medicineTypes ?? [];
  const toPrescribe = lines.length
    ? (quote.data?.lines ?? []).filter(
        (line) => line.medicineKind && NEEDS_PRESCRIPTION.has(line.medicineKind),
      )
    : [];

  /** Empties the till for the next sale, its prescription included. */
  const clearSale = () => {
    dispatch({ type: 'clear' });
    setPrescription(NO_PRESCRIPTION);
  };

  const customerName = state.customer?.name ?? 'Walk-in';
  const selectedLine = state.lines[state.selected];
  const quoteOf = (/** @type {number} */ index) =>
    quote.data?.lines.find((line) => line.stockId === state.lines[index]?.stockId);

  /** F9 right after a change waits for the new prices, then opens the payment window. */
  const pay = async () => {
    if (!lines.length) return;
    let priced = current;
    if (!priced) {
      try {
        priced = await queryClient.fetchQuery({
          queryKey: quoteKey(lines),
          queryFn: () => fetchQuote(lines),
        });
      } catch (error) {
        notify.failure('Could not work out the prices', error, { id: 'till-quote' });
        return;
      }
    }
    const sale = /** @type {import("./till-api.js").SaleQuote} */ (priced);
    const problem = lineProblem(sale);
    if (problem) {
      notify.info(problem, { id: 'till-blocked' });
      return;
    }
    // What a cashier may not do alone is approved first; then the payment window opens.
    if (sale.lines.some((line) => line.needsApproval.length) && !approvedToken) {
      setApprovalErrors({});
      setDialog('approval');
      return;
    }
    setPaymentErrors({});
    setDialog('pay');
  };

  /**
   * @param {import('../approvals/approval-fields.jsx').ApprovalEntry} entry
   * @returns {void}
   */
  const submitApproval = (entry) => {
    approve.mutate(
      { lines, reason: entry.reason.trim(), approver: entry.approver.trim(), pin: entry.pin },
      {
        onSuccess: (granted) => {
          setApproval({ token: granted.token, key: linesKey });
          notify.success(`Approved by ${granted.approvedBy}`);
          setPaymentErrors({});
          setDialog('pay');
        },
        onError: (error) => {
          setApprovalErrors(approvalErrorsOf(error));
          const details = isApiError(error) ? (error.details ?? []) : [];
          notify.failure('Not approved', error, {
            description: details.length
              ? details.map((detail) => detail.message).join('. ')
              : undefined,
          });
        },
      },
    );
  };

  /**
   * @param {Record<string, unknown>[]} payments
   * @returns {void}
   */
  const submitPayment = (payments) => {
    complete.mutate(
      {
        requestKey: state.requestKey,
        lines,
        ...customerForApi(state.customer),
        payments,
        ...(approvedToken ? { approvalToken: approvedToken } : {}),
        ...(toPrescribe.length ? { prescription: prescriptionForApi(prescription) } : {}),
      },
      {
        onSuccess: (sale) => {
          setDialog(null);
          setDone(sale);
          setApproval(null);
          clearSale();
        },
        onError: (error) => {
          const details = isApiError(error) ? (error.details ?? []) : [];
          /** @type {Record<string, string>} */
          const fields = {};
          for (const detail of details) {
            const field = paymentField(detail.path, payments);
            if (field) fields[field] = detail.message;
          }
          setPaymentErrors(fields);
          // The toast says it too, problems on the lines included.
          notify.failure('Could not complete the sale', error, {
            description: details.length
              ? details.map((detail) => detail.message).join('. ')
              : undefined,
          });
        },
      },
    );
  };

  /** @returns {Promise<boolean>} Whether the sale is now on hold (or there was nothing to hold). */
  const holdCurrent = async () => {
    if (!lines.length) return true;
    try {
      const saved = await hold.mutateAsync({ lines, ...customerForApi(state.customer) });
      clearSale();
      notify.success(`Sale held for ${saved.customerName ?? 'Walk-in'}`, {
        description: 'Recall it from Held sales, at any till.',
      });
      return true;
    } catch (error) {
      notify.failure('Could not hold the sale', error);
      return false;
    }
  };

  /**
   * @param {import('./till-api.js').HeldSaleSummary} sale
   * @returns {Promise<void>}
   */
  const recallSale = async (sale) => {
    // The sale on the till is held first, so nothing is lost.
    if (!(await holdCurrent())) return;
    try {
      const recalled = await recall.mutateAsync(sale.id);
      dispatch({
        type: 'load',
        lines: recalled.lines.map((line) => ({
          ...line,
          itemName: null,
          batchNo: null,
          expiryDate: null,
        })),
        customer: recalled.customerId
          ? { id: recalled.customerId, name: recalled.customerName, phone: recalled.customerPhone }
          : recalled.customerName
            ? { name: recalled.customerName, phone: recalled.customerPhone }
            : null,
      });
      setDialog(null);
      focusSearch();
    } catch (error) {
      notify.failure('Could not recall the sale', error);
    }
  };

  /**
   * @param {import('./till-api.js').HeldSaleSummary} sale
   * @returns {void}
   */
  const discardSale = (sale) =>
    ask({
      title: 'Discard this held sale?',
      description: `${sale.customerName ?? 'Walk-in'}, ${sale.lineCount} items, ${format.money(sale.net)}. It cannot be recalled afterwards.`,
      confirmLabel: 'Discard sale',
      destructive: true,
      onConfirm: () => discard.mutateAsync(sale.id),
    });

  const askClear = () =>
    ask({
      title: 'Clear this sale?',
      description: `The ${state.lines.length} items on the till will be removed. Nothing has been sold.`,
      confirmLabel: 'Clear sale',
      destructive: true,
      onConfirm: async () => {
        clearSale();
        focusSearch();
      },
    });

  const print = async () => {
    if (!done) return;
    try {
      await openReceipt(done.id, { original: true });
    } catch (error) {
      notify.failure('Could not print the receipt', error);
    }
  };

  // Shortcuts work anywhere on the screen while no window is open over it.
  const anyDialogOpen = dialog !== null || done !== null;
  const onShortcut = useEffectEvent((/** @type {KeyboardEvent} */ event) => {
    if (anyDialogOpen || document.querySelector('[role="alertdialog"], [role="dialog"]')) return;
    /** @type {Record<string, () => void>} */
    const handlers = {
      [TILL_KEYS.SEARCH]: focusSearch,
      [TILL_KEYS.CUSTOMER]: () => setDialog('customer'),
      [TILL_KEYS.PRESCRIPTION]: () => doctorRef.current?.focus(),
      [TILL_KEYS.DISCOUNT]: () => selectedLine && setDialog('discount'),
      [TILL_KEYS.PRICE]: () => selectedLine && setDialog('price'),
      [TILL_KEYS.PAY]: () => void pay(),
    };
    if (event.key === TILL_KEYS.HOLD) {
      event.preventDefault();
      if (event.shiftKey) setDialog('held');
      else void holdCurrent();
    } else if (handlers[event.key]) {
      event.preventDefault();
      handlers[event.key]();
    } else if (event.key === 'Escape' && state.lines.length) {
      event.preventDefault();
      askClear();
    }
  });
  useEffect(() => {
    const listener = (/** @type {KeyboardEvent} */ event) => onShortcut(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  useEffect(() => focusSearch(), [focusSearch]);

  /**
   * Keys typed in the empty search box change the selected line.
   *
   * @param {React.KeyboardEvent<HTMLInputElement>} event
   * @returns {void}
   */
  const onIdleKey = (event) => {
    const index = state.selected;
    /** @type {Record<string, () => void>} */
    const actions = {
      ArrowUp: () => dispatch({ type: 'select', index: index - 1 }),
      ArrowDown: () => dispatch({ type: 'select', index: index + 1 }),
      '+': () => dispatch({ type: 'step', index, delta: 1 }),
      '-': () => dispatch({ type: 'step', index, delta: -1 }),
      Delete: () => dispatch({ type: 'remove', index }),
    };
    if (actions[event.key] && state.lines.length) {
      event.preventDefault();
      actions[event.key]();
    }
  };

  const heldSales = held.data ?? [];
  const busy = hold.isPending || recall.isPending;

  return (
    <div className="grid gap-4 pb-24 lg:grid-cols-[minmax(0,1fr)_22rem] lg:pb-0">
      <h1 className="sr-only">New sale</h1>
      <section aria-label="Sale" className="grid min-w-0 content-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-10" onClick={() => setDialog('customer')}>
            <UserRound aria-hidden="true" />
            <span className="text-muted-foreground">Customer</span>
            <span className="font-semibold">{customerName}</span>
          </Button>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              disabled={!lines.length || busy}
              onClick={() => void holdCurrent()}
            >
              <PauseCircle aria-hidden="true" /> Hold
            </Button>
            <Button variant="outline" onClick={() => setDialog('held')}>
              Held ({heldSales.length})
            </Button>
          </div>
        </div>

        <ItemSearch
          inputRef={searchRef}
          medicineTypes={medicineTypes}
          onIdleKey={onIdleKey}
          onAdd={(batch, quantity) => dispatch({ type: 'add', batch, quantity })}
        />

        <SaleLines
          lines={state.lines}
          quoteOf={quoteOf}
          selected={state.selected}
          dispatch={dispatch}
          onDiscount={() => setDialog('discount')}
          onPrice={() => setDialog('price')}
          approved={Boolean(approvedToken)}
          medicineTypes={medicineTypes}
        />
        {toPrescribe.length > 0 && (
          <PrescriptionStrip
            itemCount={toPrescribe.length}
            value={prescription}
            onChange={setPrescription}
            photoMaxKb={settings.data?.prescriptionPhotoMaxKb ?? 0}
            doctorRef={doctorRef}
          />
        )}
      </section>

      <aside aria-label="Payment" className="hidden content-start gap-4 lg:grid">
        <SaleTotals
          totals={totals}
          lineCount={state.lines.length}
          units={units}
          updating={updating}
          blocked={blocked}
          onPay={() => void pay()}
          toApprove={toApprove.length}
          approved={Boolean(approvedToken)}
        />
        <section aria-label="Held sales" className="rounded-lg border bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold">Held sales</h2>
          {heldSales.length ? (
            <ul>
              {heldSales.slice(0, HELD_SHOWN).map((sale) => (
                <HeldSaleRow
                  key={sale.id}
                  sale={sale}
                  busy={busy}
                  onRecall={(s) => void recallSale(s)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              None. Hold parks a sale to serve the next person.
            </p>
          )}
        </section>
      </aside>

      {/* Phones and tablets: the total and Pay stay at the bottom of the screen; the side panel only shows on wide screens. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgb(0_0_0/0.08)] sm:px-6 lg:hidden">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            {SALES_LABELS.NET_AMOUNT} · {state.lines.length}{' '}
            {state.lines.length === 1 ? 'item' : 'items'}
          </p>
          <p className="text-2xl font-bold tabular-nums">{format.money(totals.net)}</p>
        </div>
        <Button
          size="lg"
          className="px-8 text-base font-bold"
          disabled={Boolean(blocked)}
          onClick={() => void pay()}
        >
          {toApprove.length && !approvedToken ? 'Get approval' : 'Pay'}
        </Button>
      </div>

      <PaymentDialog
        open={dialog === 'pay'}
        onOpenChange={(open) => setDialog(open ? 'pay' : null)}
        net={totals.net}
        summary={`${customerName} · ${state.lines.length} ${state.lines.length === 1 ? 'line' : 'lines'}`}
        rules={{
          notes: settings.data?.quickCashNotes ?? [],
          banks: banks.data ?? [],
          canAcceptCheques: settings.data?.canAcceptCheques ?? false,
          chequeMaxAgeMonths: settings.data?.chequeMaxAgeMonths ?? 0,
        }}
        pending={complete.isPending}
        serverErrors={paymentErrors}
        onSubmit={submitPayment}
      />
      <CustomerDialog
        open={dialog === 'customer'}
        onOpenChange={(open) => setDialog(open ? 'customer' : null)}
        onChoose={(customer) => dispatch({ type: 'setCustomer', customer })}
      />
      <ApprovalDialog
        open={dialog === 'approval'}
        onOpenChange={(open) => setDialog(open ? 'approval' : null)}
        lines={toApprove}
        discountLimit={settings.data?.selfDiscountLimit ?? 0}
        quickReasons={settings.data?.approvalReasons ?? []}
        pending={approve.isPending}
        serverErrors={approvalErrors}
        onSubmit={submitApproval}
      />
      <PriceDialog
        line={
          dialog === 'price' && selectedLine
            ? {
                name: quoteOf(state.selected)?.itemName ?? selectedLine.itemName ?? 'this line',
                shelfPrice: quoteOf(state.selected)?.batchLabelPrice ?? '0',
                price: quoteOf(state.selected)?.labelPrice ?? '',
              }
            : null
        }
        onClose={() => setDialog(null)}
        onSave={(labelPrice) => {
          dispatch({ type: 'setPrice', index: state.selected, labelPrice });
          setDialog(null);
        }}
      />
      <DiscountDialog
        line={
          dialog === 'discount' && selectedLine
            ? {
                name: quoteOf(state.selected)?.itemName ?? selectedLine.itemName ?? 'this line',
                discountPercent: selectedLine.discountPercent,
              }
            : null
        }
        limit={settings.data?.selfDiscountLimit ?? 0}
        onClose={() => setDialog(null)}
        onSave={(discountPercent) => {
          dispatch({ type: 'setDiscount', index: state.selected, discountPercent });
          setDialog(null);
        }}
      />
      <HeldSalesDialog
        open={dialog === 'held'}
        onOpenChange={(open) => setDialog(open ? 'held' : null)}
        sales={held.data}
        loading={held.isLoading}
        busy={busy}
        onRecall={(sale) => void recallSale(sale)}
        onDiscard={discardSale}
      />
      <SaleDoneDialog
        sale={done}
        onPrint={() => void print()}
        onNext={() => setDone(null)}
        returnFocusTo={searchRef}
      />
      {confirmDialog}
    </div>
  );
}
